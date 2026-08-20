// One-off manual test for the Brevo email/SMS integration (server/_core/notification.ts).
// Run with your real BREVO_API_KEY (and BREVO_SENDER_EMAIL for the email test)
// set in the environment, e.g.:
//
//   pnpm exec tsx scripts/test-brevo.ts email you@example.com
//   pnpm exec tsx scripts/test-brevo.ts sms 88112233
//
// Not wired into any app flow — this only exists so you can confirm your
// Brevo credentials actually work before relying on them, without spamming
// a real user through the app.
import "dotenv/config";
import { sendAccountEmail, sendAccountSms } from "../server/_core/notification";

async function main() {
  const [mode, target] = process.argv.slice(2);
  if (mode === "email" && target) {
    const sent = await sendAccountEmail({ to: target, subject: "SUGI ASAYAKE — Brevo test", content: "Энэ бол Brevo холболтыг шалгах туршилтын имэйл." });
    console.log(sent ? "Email sent via Brevo." : "Email NOT sent — check BREVO_API_KEY / BREVO_SENDER_EMAIL, or see the [Email] log line above for the fallback content.");
  } else if (mode === "sms" && target) {
    const sent = await sendAccountSms({ to: target, content: "SUGI ASAYAKE: Brevo SMS холболтыг шалгаж байна." });
    console.log(sent ? "SMS sent via Brevo." : "SMS NOT sent — check BREVO_API_KEY, phone format, or see the [SMS] log line above for the fallback content.");
  } else {
    console.log("Usage: pnpm exec tsx scripts/test-brevo.ts <email|sms> <recipient>");
    process.exitCode = 1;
  }
}

main();
