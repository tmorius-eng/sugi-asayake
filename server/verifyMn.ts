import type { Express, Request, Response } from "express";
import { randomInt, randomUUID } from "node:crypto";
import { ENV } from "./_core/env";
import { limitVerifyMnCallbackTraffic } from "./_core/security";
import { attachVerifyMnSessionId, createPendingPhoneVerificationSession, deletePendingPhoneVerificationSession, getPhoneVerificationSessionByLocalId, updatePhoneVerificationSessionStatus } from "./db";

// verify.mn (2026-09-05): Mongolian Mobile-Originated SMS phone verification.
// Added specifically because Brevo email delivery has been unreliable for
// Tom (recurring "unauthorized IP" errors) -- this gives forgot-password a
// working alternative that doesn't depend on Brevo at all, plus an optional
// phone-verification step at register. See CLAUDE.md and the approved plan
// this was built from for the full history/reasoning.
const VERIFY_MN_BASE_URL = "https://api.verify.mn";
const SHORTCODE = "144773";
// The 300s TTL verify.mn documents for a session -- used only as a fallback
// if their response is ever missing expiresAt, never as the primary source.
const DEFAULT_TTL_MS = 300_000;

export type VerifyMnPurpose = "register" | "password_reset" | "checkout";
export type VerifyMnSessionStatus = "PENDING" | "VERIFIED" | "EXPIRED";

export type CreateSessionResult = {
  sessionId: string;
  smsUri: string;
  displayInstruction: string;
  expiresAt: string;
};

export type SessionStatusResult = {
  sessionStatus: VerifyMnSessionStatus;
  callbackStatus: "PENDING" | "SENT" | "FAILED";
  verifiedAt: string | null;
  expiresAt: string;
};

// verify.mn expects a bare 8-digit local mobile number (their own example
// payload uses "90144773", no "976" country code) -- distinct from
// server/_core/notification.ts's normalizePhoneForSms, which returns the
// 11-digit 976-prefixed shape Brevo's SMS API wants instead. Two different
// providers, two different expected shapes; kept as two separate small
// functions rather than one "generic" phone helper pretending both agree.
export function normalizePhoneForVerifyMn(rawPhone: string): string | null {
  const digits = rawPhone.replace(/\D/g, "");
  const local = digits.length > 8 && digits.startsWith("976") ? digits.slice(3) : digits;
  return /^\d{8}$/.test(local) ? local : null;
}

// Per the integration spec: fail loudly here, unlike every other optional
// integration in this codebase (Brevo/Honeybadger/S3 all go through
// server/_core/env.ts's ENV object and silently no-op/log when unconfigured
// instead of throwing). A missing key here means phone verification cannot
// possibly work right now -- letting a shopper reach a silent dead-end would
// be worse than a clear, immediate error. Deliberate exception, not an
// oversight -- see ENV.verifyMnApiKey's own comment.
function requireApiKey(): string {
  if (!ENV.verifyMnApiKey) throw new Error("VERIFY_MN_API_KEY тохируулаагүй байна.");
  return ENV.verifyMnApiKey;
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// No app-wide "public base URL" env exists yet (server/_core/notification.ts
// has the same gap for transactional emails, which is why every email in
// this app is plain text with no link). Without one, there's nowhere real
// for verify.mn to call back TO, so this deliberately returns undefined --
// meaning the client-side poll (auth.phoneVerificationStatus, every 3s,
// exactly like Checkout.tsx already does for QPay) is what actually drives
// every phone-verification flow right now. registerVerifyMnCallbackRoute
// below is still wired up and ready the moment a public URL exists
// elsewhere in this app to reuse, rather than left unbuilt.
function callbackUrlFor(localSessionRowId: number): string | undefined {
  void localSessionRowId;
  return undefined;
}

async function verifyMnFetch(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const apiKey = requireApiKey();
  const response = await fetch(`${VERIFY_MN_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.message === "string" ? payload.message : response.statusText;
    throw new Error(`verify.mn request failed (${response.status}): ${message}`);
  }
  return payload ?? {};
}

/**
 * Creates a real verify.mn session and starts tracking it locally. Costs the
 * end user 150₮ (charged by their own mobile operator) the moment they text
 * the code back -- callers MUST NOT invoke this for a phone number they
 * haven't already confirmed should receive one (see auth.startPhoneVerification's
 * anti-enumeration handling for the password_reset case, which never reaches
 * this function for a phone with no matching account).
 */
export async function createVerificationSession(input: { phone: string; purpose: VerifyMnPurpose; userId: number | null }): Promise<CreateSessionResult> {
  // Checked first, before touching the DB at all -- otherwise an
  // unconfigured deployment would reserve a placeholder row for every
  // attempt it can never actually fulfill (see requireApiKey's own comment
  // on why this throws instead of the rest of this codebase's usual silent
  // no-op).
  requireApiKey();
  const phone = normalizePhoneForVerifyMn(input.phone);
  if (!phone) throw new Error("Утасны дугаар буруу байна. Монголын үүрэн холбооны 8 оронтой дугаар оруулна уу.");
  const code = generateCode();
  const provisionalExpiresAt = new Date(Date.now() + DEFAULT_TTL_MS);

  // Reserve a local row FIRST (with a temporary placeholder in place of
  // verify.mn's real session id, which doesn't exist yet -- their API only
  // returns it in the POST /sessions response, but our own callback URL has
  // to be included IN that same POST body). This row's own id is what a
  // real callback URL would embed once one is configured -- see
  // callbackUrlFor's comment on why that's not wired up yet.
  const localId = await createPendingPhoneVerificationSession({ userId: input.userId, purpose: input.purpose, phone, code, expiresAt: provisionalExpiresAt });

  try {
    const payload = await verifyMnFetch("/sessions", {
      method: "POST",
      body: JSON.stringify({ phone, text: code, callback: callbackUrlFor(localId) }),
    });
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
    if (!sessionId) throw new Error("verify.mn сессийн ID буцаагүй байна.");
    const smsUri = typeof payload.smsUri === "string" ? payload.smsUri : `sms:${SHORTCODE}?body=${encodeURIComponent(code)}`;
    const displayInstruction = typeof payload.displayInstruction === "string" ? payload.displayInstruction : `${phone} дугаараас ${SHORTCODE} руу "${code}" гэж бичээд илгээнэ үү.`;
    const expiresAt = typeof payload.expiresAt === "string" ? payload.expiresAt : provisionalExpiresAt.toISOString();

    await attachVerifyMnSessionId(localId, sessionId);
    return { sessionId, smsUri, displayInstruction, expiresAt };
  } catch (error) {
    // The API call failed -- don't leave an orphaned placeholder row behind.
    await deletePendingPhoneVerificationSession(localId);
    console.error("[VerifyMn] Session creation failed", error);
    throw error;
  }
}

// Tom, 2026-09-05 ("ymar code iig ymar dugaar uruu yvuulah haragdahgui baina
// shde!! bas 5 minut hugtsaaan ch haragdhgui"): the anti-enumeration no-op
// path (auth.startPhoneVerification, when the typed phone matches no real
// account) used to return a distinctly generic, vague message with an
// already-expired timestamp -- confusing on its own, and ALSO a real
// timing side-channel: a genuine session runs PENDING for a full 5 minutes
// before ever reporting EXPIRED, so a no-op that reports differently (or
// never expires at all) is a way to tell "not registered" from "registered,
// just hasn't replied yet" by simply waiting and comparing. This builds a
// fake session that is byte-for-byte the same SHAPE as a real one -- same
// instruction format, same fake-but-plausible 6-digit code, same 300s TTL,
// same eventual EXPIRED after that TTL (computed from the timestamp
// embedded in the "noop:<epochMs>:<uuid>" session id, checked by
// auth.phoneVerificationStatus) -- so neither the UI nor the timing reveals
// anything about whether the phone is registered.
export function createNoOpVerificationSession(phone: string): CreateSessionResult {
  const displayPhone = normalizePhoneForVerifyMn(phone) ?? phone;
  const code = generateCode();
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS);
  return {
    sessionId: `noop:${Date.now()}:${randomUUID()}`,
    smsUri: `sms:${SHORTCODE}?body=${encodeURIComponent(code)}`,
    displayInstruction: `${displayPhone} дугаараас ${SHORTCODE} руу "${code}" гэж бичээд илгээнэ үү.`,
    expiresAt: expiresAt.toISOString(),
  };
}

/** True once a no-op session's fake 300s TTL (see createNoOpVerificationSession)
 *  has elapsed -- mirrors a real session's PENDING-for-300s-then-EXPIRED
 *  lifecycle exactly, parsed from the timestamp embedded in its id. */
export function isNoOpSessionExpired(noOpSessionId: string): boolean {
  const createdAtMs = Number(noOpSessionId.split(":")[1]);
  if (!Number.isFinite(createdAtMs)) return true;
  return Date.now() - createdAtMs >= DEFAULT_TTL_MS;
}

/** Live GET /sessions/{id} -- the source of truth, polled by the client
 *  every 3s and (best-effort, once a callback URL exists) by the callback
 *  route below. Never trust a cached local status column alone before
 *  spending a session (resetting a password, attaching a phone). */
export async function getSessionStatus(sessionId: string): Promise<SessionStatusResult> {
  const payload = await verifyMnFetch(`/sessions/${encodeURIComponent(sessionId)}`);
  const sessionStatus: VerifyMnSessionStatus = payload.sessionStatus === "VERIFIED" || payload.sessionStatus === "EXPIRED" ? payload.sessionStatus : "PENDING";
  const callbackStatus = payload.callbackStatus === "SENT" || payload.callbackStatus === "FAILED" ? payload.callbackStatus : "PENDING";
  return {
    sessionStatus,
    callbackStatus,
    verifiedAt: typeof payload.verifiedAt === "string" ? payload.verifiedAt : null,
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : new Date().toISOString(),
  };
}

/**
 * Registered but currently unreachable in practice (verify.mn only calls a
 * callback URL we actually supplied, and createVerificationSession supplies
 * none -- see callbackUrlFor). Built now, ready the moment a real public URL
 * exists, rather than left for a future rewrite. Per spec: no body, no
 * signature, must return 2xx fast (<1s) -- treated as a pure wake-up
 * signal, so the actual status re-check happens after responding.
 */
export function registerVerifyMnCallbackRoute(app: Express) {
  app.get("/api/verify-mn/callback/:localSessionId", limitVerifyMnCallbackTraffic, (req: Request, res: Response) => {
    res.status(200).send("ok");
    const localSessionId = Number(req.params.localSessionId);
    if (!Number.isInteger(localSessionId)) return;
    void (async () => {
      try {
        const session = await getPhoneVerificationSessionByLocalId(localSessionId);
        if (!session) return;
        const live = await getSessionStatus(session.verifyMnSessionId);
        const mapped = live.sessionStatus === "VERIFIED" ? "verified" : live.sessionStatus === "EXPIRED" ? "expired" : "pending";
        await updatePhoneVerificationSessionStatus(session.id, mapped);
      } catch (error) {
        console.error("[VerifyMn] Callback status refresh failed", error);
      }
    })();
  });
}
