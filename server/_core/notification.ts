import { ENV } from "./env";

// 2026-09-20 (P2-2): checkout awaits the confirmation email before answering
// the shopper; a hung Brevo used to hold that request open with no bound.
const BREVO_TIMEOUT_MS = 15_000;

/**
 * Deliver a transactional email if a Brevo API key is configured, otherwise
 * fall back to a structured server-log line (matches the original "admin can
 * securely copy the generated link from the dashboard" fallback behaviour
 * documented for this project). Shared by `notifyOwner` and `sendAccountEmail`
 * below. Returns true if an email was actually sent, false if it only logged.
 */
/**
 * Имэйлийн илгээгчийн нэр. `BREVO_SENDER_NAME` тавигдсан бол түүнийг, үгүй бол
 * /admin-ийн дэлгүүрийн нэрийг (2026-09-20: шинэ эзэн нэрээ сольход имэйл ч
 * дагаж өөрчлөгдөх ёстой — өмнө нь кодод хатуу бичигдсэн байв).
 *
 * `db.ts` ЭНЭ модулийг import хийдэг тул энд статик import бичвэл тойрог
 * хамаарал үүснэ — динамик import нь түүнээс зайлсхийнэ (утга нь цаанаа
 * кэштэй тул имэйл бүрт DB уншихгүй).
 */
async function senderName(): Promise<string> {
  if (ENV.brevoSenderName) return ENV.brevoSenderName;
  try {
    const { getSiteName } = await import("../db");
    return await getSiteName();
  } catch {
    return "";
  }
}

/**
 * 2026-09-27 (I23): callers outside this file (server/automation.ts's
 * abandoned-cart and review-request jobs) used to check `!ENV.brevoApiKey`
 * alone to decide "email delivery is switched off entirely, so a false
 * return from deliverEmail still counts as delivered rather than retried" --
 * but `deliverEmail` ALSO refuses to send (same false-with-a-log-line
 * fallback) when `BREVO_SENDER_EMAIL` is missing even though a real API key
 * is set. That half-configured state made both jobs mark every reminder as
 * "delivered" when nothing was ever sent, with no retry.
 */
export function emailConfigured(): boolean {
  // 2026-10-01: NOTIFICATIONS_SUPPRESS=1 (staging / тест) үед имэйл "унтарсан"
  // тул дээрх ажлууд дахин оролдохгүй, илгээсэнд тооцно.
  return Boolean(ENV.brevoApiKey && ENV.brevoSenderEmail && !ENV.notificationsSuppressed);
}

/** Keeps just enough of a recipient to recognise it in a log, never the whole address/number. */
function maskRecipient(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 4 ? "***" : `***${trimmed.slice(-3)}`;
}

/**
 * 2026-10-01: the "not delivered" fallback used to print the whole message --
 * password-reset links, gift-card codes -- and, being a raw template string, let
 * a recipient/subject containing a newline forge extra log lines. Now ONE JSON
 * line with the masked recipient and the body LENGTH only (JSON.stringify
 * escapes control characters).
 */
function logUndelivered(channel: "email" | "sms" | "owner", to: string, content: string, reason: string, subject?: string) {
  console.log(JSON.stringify({ event: "notification_not_sent", channel, reason, to: maskRecipient(to), ...(subject !== undefined ? { subject: subject.slice(0, 120) } : {}), length: content.length }));
}

async function deliverEmail(input: { to: string; subject: string; content: string }): Promise<boolean> {
  if (ENV.notificationsSuppressed) {
    logUndelivered("email", input.to, input.content, "suppressed", input.subject);
    return false;
  }
  if (!ENV.brevoApiKey || !ENV.brevoSenderEmail) {
    logUndelivered("email", input.to, input.content, "not_configured", input.subject);
    return false;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
      headers: {
        "api-key": ENV.brevoApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: ENV.brevoSenderEmail, name: await senderName() },
        to: [{ email: input.to }],
        subject: input.subject,
        textContent: input.content,
      }),
    });
    if (!response.ok) {
      console.error("[Email] Brevo send failed", response.status, await response.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Email] Brevo send threw", error);
    return false;
  }
}

/**
 * Normalize a loosely-formatted phone number (spaces, dashes, parens, an
 * optional leading +) into the digits-only, country-code-prefixed shape
 * Brevo's SMS API expects (e.g. "+976 8811 2233" / "88112233" -> "97688112233").
 * Assumes Mongolia (+976, 8-digit local numbers) when no country code is
 * present — this app only collects Mongolian phone numbers at checkout today.
 * Returns null if the result doesn't look like a plausible number.
 */
export function normalizePhoneForSms(rawPhone: string): string | null {
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return null;
  // 🔴 2026-09-23: `startsWith("976")` дангаараа буруу. Монголын бодит 8
  // оронтой дугаарын зарим нь "976"-аар ЭХЭЛДЭГ (жишээ нь G-Mobile-ийн
  // `97612345`) — хуучин код түүнийг "улсын код аль хэдийн байна" гэж үзээд
  // 8 орон буцаадаг тул доорх 11 оронтой шалгалтад унаж, SMS ХЭЗЭЭ Ч
  // илгээгддэггүй байв (зөвхөн серверийн лог мөр үлдэнэ).
  // `shared/mobile.ts` үүнийг аль хэдийн зөв хийдэг: улсын код гэж үзэхийн
  // тулд БҮТЭН 11 орон байх ёстой.
  const withCountryCode = digits.length === 11 && digits.startsWith("976")
    ? digits
    : digits.length === 8 ? `976${digits}` : null;
  // 976 + 8-digit Mongolian mobile number = 11 digits total.
  if (!withCountryCode || withCountryCode.length !== 11) return null;
  return withCountryCode;
}

/**
 * Deliver a transactional SMS if a Brevo API key is configured, otherwise
 * fall back to a server-log line, same fallback shape as `deliverEmail`.
 *
 * Note: Brevo's free tier covers email (300/day); SMS is metered separately
 * (a small free trial credit, then pay-as-you-go) and country coverage for
 * Mongolia should be double-checked in the Brevo dashboard under
 * Transactional SMS > country pricing before relying on this in production.
 */
async function deliverSms(input: { to: string; content: string }): Promise<boolean> {
  if (ENV.notificationsSuppressed) {
    logUndelivered("sms", input.to, input.content, "suppressed");
    return false;
  }
  if (!ENV.brevoApiKey) {
    logUndelivered("sms", input.to, input.content, "not_configured");
    return false;
  }
  const recipient = normalizePhoneForSms(input.to);
  if (!recipient) {
    logUndelivered("sms", input.to, input.content, "bad_phone");
    return false;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
      method: "POST",
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
      headers: {
        "api-key": ENV.brevoApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: ENV.brevoSmsSender,
        recipient,
        content: input.content,
        type: "transactional",
      }),
    });
    if (!response.ok) {
      console.error("[SMS] Brevo send failed", response.status, await response.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.error("[SMS] Brevo send threw", error);
    return false;
  }
}

/**
 * Notify the store owner/admin about something that needs attention (a new
 * staff invitation, etc).
 */
export async function notifyOwner(input: { title: string; content: string }): Promise<boolean> {
  if (!ENV.ownerEmail) {
    logUndelivered("owner", "", input.content, "no_owner_email", input.title);
    return false;
  }
  return deliverEmail({ to: ENV.ownerEmail, subject: input.title, content: input.content });
}

/**
 * Send a transactional email to one of the app's own users — password reset
 * links, email verification links, order confirmations, etc. Unlike
 * `notifyOwner`, the recipient here is arbitrary (any registered user), not
 * the fixed OWNER_EMAIL address.
 */
export async function sendAccountEmail(input: { to: string; subject: string; content: string }): Promise<boolean> {
  return deliverEmail(input);
}

/**
 * Send a transactional SMS to a customer/user's Mongolian phone number
 * (order confirmations, delivery updates, etc). See `deliverSms` for the
 * Brevo free-tier/coverage caveats.
 */
export async function sendAccountSms(input: { to: string; content: string }): Promise<boolean> {
  return deliverSms(input);
}
