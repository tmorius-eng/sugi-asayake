import { ENV } from "./env";

/**
 * Deliver a transactional email if a Resend API key is configured, otherwise
 * fall back to a structured server-log line (matches the original "admin can
 * securely copy the generated link from the dashboard" fallback behaviour
 * documented for this project). Shared by `notifyOwner` and `sendAccountEmail`
 * below. Returns true if an email was actually sent, false if it only logged.
 */
async function deliverEmail(input: { to: string; subject: string; content: string }): Promise<boolean> {
  if (!ENV.resendApiKey) {
    console.log(`[Email] To: ${input.to}\n${input.subject}\n${input.content}`);
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ENV.resendFromEmail,
        to: [input.to],
        subject: input.subject,
        text: input.content,
      }),
    });
    if (!response.ok) {
      console.error("[Email] Resend send failed", response.status, await response.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Email] Resend send threw", error);
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
