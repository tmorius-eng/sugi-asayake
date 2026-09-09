import { useState } from "react";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { Link, useLocation } from "wouter";
import { CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";
import CommerceHeader from "@/components/CommerceHeader";
import PhoneVerificationStep from "@/components/PhoneVerificationStep";
import SiteFooter from "@/components/SiteFooter";
import { footerLogoUrl, footerSocials } from "@/components/site-footer-data";
import { trpc } from "@/lib/trpc";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хүсэлт амжилтгүй боллоо. Дахин оролдоно уу.";

// Tom, 2026-09-05 (explicit): "remove email eer sergeeh!! we do not need
// brevo at all!!" -- the email-code reset path (auth.requestPasswordReset /
// auth.resetPassword) is gone from this page entirely; verify.mn's SMS
// phone verification is now the ONLY password-recovery method here. Those
// 2 procedures still exist server-side (server/routers.ts) since removing
// them is a separate, larger backend decision -- this page just no longer
// calls them or shows a method toggle.
export default function ForgotPassword() {
  useDocumentMeta("Нууц үг сэргээх — SUGI ASAYAKE", null);
  const [, setLocation] = useLocation();
  const [verifiedPhoneSessionId, setVerifiedPhoneSessionId] = useState<string | null>(null);
  const [phonePassword, setPhonePassword] = useState("");
  const [phoneConfirmPassword, setPhoneConfirmPassword] = useState("");
  const resetPasswordViaPhone = trpc.auth.resetPasswordViaPhone.useMutation();

  const submitPhoneReset = async () => {
    if (!verifiedPhoneSessionId) return;
    if (phonePassword.length < 8) {
      toast.error("Нууц үг дор хаяж 8 тэмдэгт байх ёстой.");
      return;
    }
    if (phonePassword !== phoneConfirmPassword) {
      toast.error("Нууц үг таарахгүй байна.");
      return;
    }
    try {
      await resetPasswordViaPhone.mutateAsync({ sessionId: verifiedPhoneSessionId, password: phonePassword });
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return (
    <div className="auth-shell">
      <CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE" />
      <main className="auth-main">
        <div className="auth-head">
          <p className="auth-kicker">ACCOUNT RECOVERY</p>
          <h1>Нууц үгээ <em>сэргээх.</em></h1>
          <p className="auth-lede">Бүртгэлтэй утасны дугаараа оруулбал SMS-ээр баталгаажуулна.</p>
        </div>

        {resetPasswordViaPhone.isSuccess ? (
          <div className="auth-card">
            <div className="auth-status-icon"><CheckCircle2 size={22} aria-hidden="true" /></div>
            <p style={{ color: "#626368", fontSize: "13px", lineHeight: 1.65 }}>Таны нууц үг амжилттай шинэчлэгдлээ. Одоо шинэ нууц үгээрээ нэвтэрч болно.</p>
            <button type="button" onClick={() => setLocation("/login")} className="auth-submit">Нэвтрэх хуудас руу</button>
          </div>
        ) : verifiedPhoneSessionId ? (
          <form onSubmit={event => { event.preventDefault(); submitPhoneReset(); }} className="auth-card">
            <div className="auth-status-icon"><CheckCircle2 size={22} aria-hidden="true" /></div>
            <p style={{ fontSize: "13px", lineHeight: 1.65, color: "#626368" }}>Утасны дугаар баталгаажлаа. Шинэ нууц үгээ оруулна уу.</p>
            <label className="auth-field">
              Шинэ нууц үг
              <div className="auth-field-shell">
                <Lock size={16} aria-hidden="true" />
                <input type="password" value={phonePassword} onChange={event => setPhonePassword(event.target.value)} placeholder="8-с дээш тэмдэгт" autoComplete="new-password" />
              </div>
            </label>
            <label className="auth-field">
              Шинэ нууц үг давтах
              <div className="auth-field-shell">
                <Lock size={16} aria-hidden="true" />
                <input type="password" value={phoneConfirmPassword} onChange={event => setPhoneConfirmPassword(event.target.value)} placeholder="Дахин оруулна уу" autoComplete="new-password" />
              </div>
            </label>
            <button type="submit" className="auth-submit">Нууц үг шинэчлэх</button>
          </form>
        ) : (
          <PhoneVerificationStep purpose="password_reset" onVerified={setVerifiedPhoneSessionId} />
        )}

        <Link href="/login" className="auth-switch">Нэвтрэх хуудас руу буцах</Link>
      </main>
      <SiteFooter logoUrl={footerLogoUrl} socials={footerSocials} />
    </div>
  );
}
