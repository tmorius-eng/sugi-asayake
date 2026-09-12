import type { Express, Request, Response } from "express";
import { getActiveIntegrationConfig, getOrderById, getPaymentAttemptByInvoiceId, markQPayPaymentAttemptFailed, markQPayPaymentAttemptPaid, storeQPayPaymentAttemptResponse } from "./db";
import { normaliseMongolianMobile } from "../shared/mobile";
import { limitQPayCallbackTraffic } from "./_core/security";

/**
 * StorePay (buy now, pay later), 2026-09-12. Tom: all four shops already
 * accept StorePay in person, so the website should too.
 *
 * Their API, as implemented by their own published Go SDK
 * (github.com/techpartners-asia/storepay-go), which is what this follows:
 *
 *   token   POST {authUrl}/oauth/token?grant_type=password
 *                &username={appUsername}&password={appPassword}
 *           with HTTP Basic auth of a SECOND pair (username/password) --
 *           two different credential pairs, which is unusual enough to be
 *           worth spelling out. Returns { access_token, expires_in, ... }.
 *   loan    POST {baseUrl}/merchant/loan
 *           { storeId, mobileNumber, description, amount, callbackUrl }
 *           -> { status: "Success", value: <loanId>, msgList: [...] }
 *   check   GET  {baseUrl}/merchant/loan/check/{loanId}
 *           -> { status, value: true|false }   (true = the customer approved
 *              it in the StorePay app and the shop will be paid)
 *   limit   POST {baseUrl}/user/possibleAmount { mobileNumber }
 *           -> { status, value: <max amount this customer may borrow> }
 *
 * Note their envelope: HTTP 200 does NOT mean success. Every response
 * carries `status`, and anything but "Success" is a failure whose reason is
 * in msgList -- so every call here checks the envelope, not the status code.
 *
 * Same discipline as server/qpay.ts: a customer-facing "paid" claim is never
 * taken from the callback body. The callback only tells us WHICH loan to ask
 * about; whether it is really approved comes from our own check call.
 *
 * Credentials live in /admin -> Интеграцууд (encrypted), not .env, because
 * they are merchant credentials an admin receives from StorePay rather than
 * host configuration. Until they are entered, the checkout option stays off.
 */

export type StorepayConfig = { authUrl: string; baseUrl: string; appUsername: string; appPassword: string; username: string; password: string; storeId: string };

const TIMEOUT_MS = 15_000;
const trimSlash = (value: string) => value.trim().replace(/\/+$/, "");

let cachedToken: { value: string; expiresAt: number; key: string } | null = null;

/** For tests, and so changed credentials take effect at once. */
export function clearStorepayTokenCache() { cachedToken = null; }

export async function getStorepayConfig(): Promise<StorepayConfig | null> {
  const settings = await getActiveIntegrationConfig("storepay");
  if (!settings) return null;
  const config = {
    authUrl: trimSlash(settings.authUrl ?? ""),
    baseUrl: trimSlash(settings.baseUrl ?? ""),
    appUsername: settings.appUsername?.trim() ?? "",
    appPassword: settings.appPassword ?? "",
    username: settings.username?.trim() ?? "",
    password: settings.password ?? "",
    storeId: settings.storeId?.trim() ?? "",
  };
  const complete = Object.values(config).every(value => value.length > 0);
  return complete ? config : null;
}

export async function getStorepayAvailability() {
  return { configured: Boolean(await getStorepayConfig()) } as const;
}

export class StorepayError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "StorepayError";
  }
}

/** Their envelope: { status, value, msgList: [{ code, text }] }. */
export function readStorepayEnvelope<T>(payload: unknown, what: string): T {
  const envelope = (payload ?? {}) as { status?: unknown; value?: unknown; msgList?: unknown };
  if (String(envelope.status) !== "Success") {
    const messages = Array.isArray(envelope.msgList) ? envelope.msgList : [];
    const first = messages[0] as { code?: unknown; text?: unknown } | undefined;
    const detail = first ? `${first.code ?? ""} ${first.text ?? ""}`.trim() : String(envelope.status ?? "хариу хоосон");
    throw new StorepayError(`${what}: StorePay татгалзлаа (${detail})`);
  }
  return envelope.value as T;
}

async function storepayToken(config: StorepayConfig): Promise<string> {
  const key = `${config.authUrl}|${config.username}|${config.appUsername}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const url = new URL(`${config.authUrl}/oauth/token`);
  url.searchParams.set("grant_type", "password");
  url.searchParams.set("username", config.appUsername);
  url.searchParams.set("password", config.appPassword);
  const basic = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const payload = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !payload?.access_token) throw new StorepayError(`StorePay-д нэвтэрч чадсангүй (${response.status})`, response.status);
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 300) * 1000, key };
  return payload.access_token;
}

async function storepayFetch(config: StorepayConfig, path: string, init: RequestInit) {
  const token = await storepayToken(config);
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) throw new StorepayError(`StorePay хүсэлт амжилтгүй (${response.status}): ${text.slice(0, 200)}`, response.status);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new StorepayError("StorePay-ийн хариу JSON биш байна.");
  }
}

/** Mongolian mobile number as StorePay expects it: 8 digits, no country code.
 *  The rule lives in shared/ because the checkout page applies it too. */
export const normaliseMobileNumber = normaliseMongolianMobile;

/** How much this customer may borrow right now (0 when they may not). */
export async function storepayPossibleAmount(mobileNumber: string): Promise<number> {
  const config = await getStorepayConfig();
  if (!config) throw new StorepayError("StorePay тохируулаагүй байна.");
  const payload = await storepayFetch(config, "/user/possibleAmount", { method: "POST", body: JSON.stringify({ mobileNumber }) });
  const value = readStorepayEnvelope<unknown>(payload, "Боломжит дүн");
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/** Asks StorePay to open a loan; the customer then approves it in their app. */
export async function createStorepayLoan(input: { mobileNumber: string; description: string; amountMnt: number; callbackUrl: string }): Promise<{ loanId: string; raw: unknown }> {
  const config = await getStorepayConfig();
  if (!config) throw new StorepayError("StorePay тохируулаагүй байна.");
  const payload = await storepayFetch(config, "/merchant/loan", {
    method: "POST",
    body: JSON.stringify({
      storeId: config.storeId,
      mobileNumber: input.mobileNumber,
      description: input.description,
      // Their SDK sends the amount as a string, decimals included.
      amount: input.amountMnt.toFixed(2),
      callbackUrl: input.callbackUrl,
    }),
  });
  const value = readStorepayEnvelope<unknown>(payload, "Зээл үүсгэх");
  const loanId = String(value ?? "").trim();
  if (!loanId || loanId === "0") throw new StorepayError("StorePay зээлийн дугаар буцаасангүй.");
  return { loanId, raw: payload };
}

/** True once the customer has approved the loan in the StorePay app. */
export async function checkStorepayLoan(loanId: string): Promise<{ approved: boolean; raw: unknown }> {
  const config = await getStorepayConfig();
  if (!config) throw new StorepayError("StorePay тохируулаагүй байна.");
  const payload = await storepayFetch(config, `/merchant/loan/check/${encodeURIComponent(loanId)}`, { method: "GET" });
  const value = readStorepayEnvelope<unknown>(payload, "Зээл шалгах");
  return { approved: value === true || String(value) === "true", raw: payload };
}

/**
 * The one place a StorePay loan turns into a paid order. Same shape as
 * verifyQPayCallback: look the attempt up, ask StorePay ourselves, and only
 * then touch the order (markQPayPaymentAttemptPaid is provider-agnostic
 * despite its historical name -- it guards against reviving cancelled or
 * already-closed orders).
 */
export async function verifyStorepayCallback(loanId: string) {
  const attempt = await getPaymentAttemptByInvoiceId(loanId);
  if (!attempt) throw new StorepayError("Тодорхойгүй StorePay зээлийн дугаар.");
  const verification = await checkStorepayLoan(loanId);
  await storeQPayPaymentAttemptResponse({ id: attempt.id, responseJson: JSON.stringify(verification.raw) });
  const order = await getOrderById(attempt.orderId);
  if (!order) throw new StorepayError("Захиалга олдсонгүй.");
  if (verification.approved) {
    await markQPayPaymentAttemptPaid({ id: attempt.id, orderId: attempt.orderId, providerPaymentId: loanId });
  } else {
    // StorePay told us the customer has not approved it (declined, or the
    // request expired). Recorded as a failed attempt, order left unpaid.
    await markQPayPaymentAttemptFailed({ id: attempt.id, providerPaymentId: loanId });
  }
  return { approved: verification.approved, orderId: attempt.orderId };
}

function callbackLoanId(req: Request) {
  const candidate = req.body?.id ?? req.body?.loanId ?? req.body?.value ?? req.query.id ?? req.query.loanId;
  const loanId = typeof candidate === "number" ? String(candidate) : candidate;
  return typeof loanId === "string" && loanId.length > 0 && loanId.length <= 128 ? loanId : null;
}

export function registerStorepayCallbackRoute(app: Express) {
  const handler = async (req: Request, res: Response) => {
    const loanId = callbackLoanId(req);
    if (!loanId) return res.status(400).json({ ok: false, error: "Missing StorePay loan id." });
    if (!(await getStorepayAvailability()).configured) return res.status(503).json({ ok: false, error: "StorePay is not configured." });
    try {
      const result = await verifyStorepayCallback(loanId);
      return res.status(200).json({ ok: true, paid: result.approved });
    } catch (error) {
      console.error("[StorePay] Callback verification failed", error);
      return res.status(500).json({ ok: false, error: "Payment verification failed." });
    }
  };
  // Their SDK only documents the callback URL, not its method or body, so
  // accept both and read the loan id from either the body or the query.
  app.post("/api/payments/storepay/callback", limitQPayCallbackTraffic, handler);
  app.get("/api/payments/storepay/callback", limitQPayCallbackTraffic, handler);
}
