import type { Express, Request, Response } from "express";
import {
  getPaymentAttemptByInvoiceId,
  markQPayPaymentAttemptPaid,
  storeQPayPaymentAttemptResponse,
} from "./db";
import { limitQPayCallbackTraffic } from "./_core/security";

type QPayConfig = {
  baseUrl: string;
  username: string;
  password: string;
  invoiceCode: string;
};

type QPayInvoiceInput = {
  senderInvoiceNo: string;
  amountMnt: number;
  description: string;
  callbackUrl: string;
};

type QPayInvoiceResponse = {
  invoiceId: string;
  qrText: string | null;
  urls: Array<{ name?: string; description?: string; logo?: string; link?: string }>;
  raw: unknown;
};

type QPayPaymentCheck = {
  paid: boolean;
  paymentId: string | null;
  raw: unknown;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function getConfig(): QPayConfig | null {
  const username = process.env.QPAY_USERNAME?.trim();
  const password = process.env.QPAY_PASSWORD?.trim();
  const invoiceCode = process.env.QPAY_INVOICE_CODE?.trim();
  if (!username || !password || !invoiceCode) return null;

  const baseUrl = process.env.QPAY_ENVIRONMENT === "sandbox" ? "https://merchant-sandbox.qpay.mn" : "https://merchant.qpay.mn";
  return { baseUrl, username, password, invoiceCode };
}

function requireConfig() {
  const config = getConfig();
  if (!config) throw new Error("QPAY_NOT_CONFIGURED");
  return config;
}

async function requestToken(config: QPayConfig) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const basic = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  const response = await fetch(`${config.baseUrl}/v2/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; expires_in?: number; message?: string } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(`QPay token request failed${payload?.message ? `: ${payload.message}` : ""}`);
  }
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 300) * 1000 };
  return cachedToken.value;
}

async function qpayFetch(path: string, init: RequestInit) {
  const config = requireConfig();
  const token = await requestToken(config);
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.message === "string" ? payload.message : response.statusText;
    throw new Error(`QPay request failed (${response.status}): ${message}`);
  }
  return payload ?? {};
}

export function getQPayAvailability() {
  return { configured: Boolean(getConfig()), environment: process.env.QPAY_ENVIRONMENT === "sandbox" ? "sandbox" : "production" } as const;
}

export async function createQPayInvoice(input: QPayInvoiceInput): Promise<QPayInvoiceResponse> {
  const config = requireConfig();
  const payload = await qpayFetch("/v2/invoice", {
    method: "POST",
    body: JSON.stringify({
      invoice_code: config.invoiceCode,
      sender_invoice_no: input.senderInvoiceNo,
      invoice_receiver_code: "terminal",
      invoice_description: input.description,
      amount: input.amountMnt,
      callback_url: input.callbackUrl,
    }),
  });
  const invoiceId = typeof payload.invoice_id === "string" ? payload.invoice_id : "";
  if (!invoiceId) throw new Error("QPay did not return an invoice ID.");

  return {
    invoiceId,
    qrText: typeof payload.qr_text === "string" ? payload.qr_text : null,
    urls: Array.isArray(payload.urls) ? payload.urls.filter((value): value is { name?: string; description?: string; logo?: string; link?: string } => Boolean(value && typeof value === "object")) : [],
    raw: payload,
  };
}

export async function checkQPayPayment(invoiceId: string): Promise<QPayPaymentCheck> {
  const payload = await qpayFetch("/v2/payment/check", {
    method: "POST",
    body: JSON.stringify({ object_type: "INVOICE", object_id: invoiceId }),
  });
  const rows = Array.isArray(payload.rows) ? payload.rows : Array.isArray(payload.payments) ? payload.payments : [];
  const successful = rows.find((row): row is Record<string, unknown> => Boolean(row && typeof row === "object") && ["PAID", "paid", "SUCCESS", "success"].includes(String((row as Record<string, unknown>).payment_status ?? (row as Record<string, unknown>).status)));
  return {
    paid: Boolean(successful),
    paymentId: successful && typeof successful.payment_id === "string" ? successful.payment_id : null,
    raw: payload,
  };
}

export async function verifyQPayCallback(invoiceId: string) {
  const attempt = await getPaymentAttemptByInvoiceId(invoiceId);
  if (!attempt) throw new Error("Unknown QPay invoice callback.");

  const verification = await checkQPayPayment(invoiceId);
  await storeQPayPaymentAttemptResponse({ id: attempt.id, responseJson: JSON.stringify(verification.raw) });
  if (verification.paid) {
    await markQPayPaymentAttemptPaid({ id: attempt.id, orderId: attempt.orderId, providerPaymentId: verification.paymentId });
  }
  return { ...verification, orderId: attempt.orderId };
}

function callbackInvoiceId(req: Request) {
  const candidate = req.body?.invoice_id ?? req.body?.invoiceId ?? req.query.invoice_id ?? req.query.invoiceId;
  return typeof candidate === "string" && candidate.length <= 128 ? candidate : null;
}

export function registerQPayCallbackRoute(app: Express) {
  app.post("/api/payments/qpay/callback", limitQPayCallbackTraffic, async (req: Request, res: Response) => {
    const invoiceId = callbackInvoiceId(req);
    if (!invoiceId) return res.status(400).json({ ok: false, error: "Missing QPay invoice ID." });
    if (!getQPayAvailability().configured) return res.status(503).json({ ok: false, error: "QPay is not configured." });

    try {
      const result = await verifyQPayCallback(invoiceId);
      return res.status(200).json({ ok: true, paid: result.paid });
    } catch (error) {
      console.error("[QPay] Callback verification failed", error);
      return res.status(500).json({ ok: false, error: "Payment verification failed." });
    }
  });
}
