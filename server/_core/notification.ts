import { ENV } from "./env";

/**
 * Deliver a transactional email if a Brevo API key is configured, otherwise
 * fall back to a structured server-log line (matches the original "admin can
 * securely copy the generated link from the dashboard" fallback behaviour
 * documented for this project). Shared by `notifyOwner` and `sendAccountEmail`
 * below. Returns true if an email was actually sent, false if it only logged.
 */
async function deliverEmail(input: { to: string; subject: string; content: string }): Promise<boolean> {
  if (!ENV.brevoApiKey || !ENV.brevoSenderEmail) {
    console.log(`[Email] To: ${input.to}\n${input.subject}\n${input.content}`);
    return false;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": ENV.brevoApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: ENV.brevoSenderEmail, name: ENV.brevoSenderName },
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
  const withCountryCode = digits.startsWith("976") ? digits : `976${digits}`;
  // 976 + 8-digit Mongolian mobile number = 11 digits total.
  if (withCountryCode.length !== 11) return null;
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
  if (!ENV.brevoApiKey) {
    console.log(`[SMS] To: ${input.to}\n${input.content}`);
    return false;
  }
  const recipient = normalizePhoneForSms(input.to);
  if (!recipient) {
    console.error("[SMS] Could not normalize phone number, not sending:", input.to);
    return false;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
      method: "POST",
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
    console.log(`[Owner notification] ${input.title}\n${input.content}`);
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
