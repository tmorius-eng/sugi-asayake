// Brevo имэйл/SMS интеграцийн (server/_core/notification.ts) нэг удаагийн гар
// туршилт. Бодит BREVO_API_KEY (имэйл туршилтад BREVO_SENDER_EMAIL) орчинд
// тохируулж ажиллуулна, жишээ:
//
//   pnpm exec tsx scripts/test-brevo.ts email you@example.com
//   pnpm exec tsx scripts/test-brevo.ts sms 88112233
//
// Аппын урсгалд холбогдоогүй — Brevo эрхээ бодит хэрэглэгчид спам илгээлгүйгээр
// ажиллаж байгааг батлахад л зориулагдсан.
import "dotenv/config";
import { sendAccountEmail, sendAccountSms } from "../server/_core/notification";

async function main() {
  const [mode, target] = process.argv.slice(2);
  if (mode === "email" && target) {
    const sent = await sendAccountEmail({ to: target, subject: "SUGI ASAYAKE — Brevo test", content: "Энэ бол Brevo холболтыг шалгах туршилтын имэйл." });
    console.log(sent ? "Email sent via Brevo." : "Email NOT sent — check BREVO_API_KEY / BREVO_SENDER_EMAIL, or make sure NOTIFICATIONS_SUPPRESS is not 1 (the JSON log line above carries a masked recipient, no body).");
  } else if (mode === "sms" && target) {
    const sent = await sendAccountSms({ to: target, content: "SUGI ASAYAKE: Brevo SMS холболтыг шалгаж байна." });
    console.log(sent ? "SMS sent via Brevo." : "SMS NOT sent — check BREVO_API_KEY, phone format, or make sure NOTIFICATIONS_SUPPRESS is not 1 (the JSON log line above carries a masked recipient, no body).");
  } else {
    console.log("Usage: pnpm exec tsx scripts/test-brevo.ts <email|sms> <recipient>");
    process.exitCode = 1;
  }
}

main();
