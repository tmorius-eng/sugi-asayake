import { useState } from "react";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { Link, useLocation, useSearch } from "wouter";
import { LoaderCircle, Lock, LogIn, Phone, User as UserIcon, UserPlus } from "lucide-react";
import { toast } from "sonner";
import CommerceHeader from "@/components/CommerceHeader";
import PhoneVerificationStep from "@/components/PhoneVerificationStep";
import SiteFooter from "@/components/SiteFooter";
import { trpc } from "@/lib/trpc";
import { useSiteText } from "@/hooks/useSiteText";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хүсэлт амжилтгүй боллоо. Дахин оролдоно уу.";

// Tom, 2026-09-06 (explicit, after seeing an unverified registration accept
// his wife's phone number with zero proof of ownership: "verify.mn geed
// ajilahgui baina shww!!! ... not just only used for forgot-password!! also
// create account!!!!"): registration is a real 2-step verify.mn flow now --
// (1) PhoneVerificationStep sends a real SMS and waits for it to come back
// VERIFIED (same shared component ForgotPassword.tsx already uses), THEN
// (2) a short name+password form actually creates the account
// (auth.completeRegistration). No account exists until step 2 succeeds, so
// there is no way to register with a number you can't actually text from.
// Login itself is still one-step phone+password (unchanged).
export default function Login() {
  const textFor = useSiteText();
  useDocumentMeta(textFor("seo-text-login-title", "Нэвтрэх — SUGI ASAYAKE"), null);
  const [verifyLine1, verifyLine2] = textFor("login-text-verify-heading", "Утасны дугаараа\nбаталгаажуулах.").split("\n");
  const [loginLine1, loginLine2] = textFor("login-text-heading", "Дахин\nтавтай морил.").split("\n");
  const [registerLine1, registerLine2] = textFor("login-text-register-heading", "Бүртгэл\nүүсгэх.").split("\n");
  const search = useSearch();
  // Lets an outside link (e.g. the homepage membership strip) land the
  // shopper directly on the registration step instead of login — same
  // read-once-at-mount pattern as redirectTarget below.
  const [mode, setMode] = useState<"login" | "register">(() => new URLSearchParams(search).get("mode") === "register" ? "register" : "login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  // Set the instant PhoneVerificationStep reports "verified" -- its presence
  // is what switches the register form from "step 1: verify" to "step 2:
  // set a name + password".
  const [verifiedSessionId, setVerifiedSessionId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const redirectTarget = (() => {
    const params = new URLSearchParams(search);
    const target = params.get("redirect");
    return target && target.startsWith("/") ? target : "/";
  })();

  const loginMutation = trpc.auth.login.useMutation();
  const completeRegistration = trpc.auth.completeRegistration.useMutation();
  const isSubmitting = loginMutation.isPending || completeRegistration.isPending;

  const submitLogin = async () => {
    if (!phone.trim() || !password) {
      toast.error("Утасны дугаар болон нууц үгээ оруулна уу.");
      return;
    }
    try {
      await loginMutation.mutateAsync({ phone: phone.trim(), password });
      await utils.auth.me.invalidate();
      setLocation(redirectTarget);
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const submitRegistration = async () => {
    if (!verifiedSessionId || !password) {
      toast.error("Нууц үгээ оруулна уу.");
      return;
    }
    try {
      await completeRegistration.mutateAsync({ sessionId: verifiedSessionId, password, name: name.trim() || undefined });
      await utils.auth.me.invalidate();
      setLocation(redirectTarget);
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  if (mode === "register" && !verifiedSessionId) {
    return (
      <div className="auth-shell">
        <CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE" />
        <main className="auth-main">
          <div className="auth-head">
            <p className="auth-kicker">01 / VERIFY PHONE</p>
            <h1>{verifyLine1} <em>{verifyLine2}</em></h1>
            <p className="auth-lede">{textFor("login-text-verify-lede", "Бүртгэл үүсгэхийн тулд эхлээд утасны дугаараа SMS-ээр баталгаажуулна уу.")}</p>
          </div>
          <PhoneVerificationStep purpose="register" onVerified={setVerifiedSessionId} />
          <button type="button" onClick={() => setMode("login")} className="auth-switch">Бүртгэлтэй юу? Нэвтрэх</button>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE" />
      <main className="auth-main">
        <div className="auth-head">
          <p className="auth-kicker">{mode === "login" ? "01 / SIGN IN" : "02 / CREATE ACCOUNT"}</p>
          <h1>{mode === "login" ? <>{loginLine1} <em>{loginLine2}</em></> : <>{registerLine1} <em>{registerLine2}</em></>}</h1>
        </div>

        {mode === "login" ? (
          <form onSubmit={event => { event.preventDefault(); submitLogin(); }} className="auth-card">
            <label className="auth-field">
              Утасны дугаар
              <div className="auth-field-shell">
                <Phone size={16} aria-hidden="true" />
                <input type="tel" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="9911 2233" autoComplete="tel" />
              </div>
            </label>
            <label className="auth-field">
              Нууц үг
              <div className="auth-field-shell">
                <Lock size={16} aria-hidden="true" />
                <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="••••••••" autoComplete="current-password" />
              </div>
            </label>
            <div style={{ textAlign: "right" }}>
              <Link href="/forgot-password" className="auth-quiet" style={{ display: "inline" }}>Нууц үгээ мартсан уу?</Link>
            </div>

            <button type="submit" disabled={isSubmitting} className="auth-submit">
              {isSubmitting ? <LoaderCircle className="animate-spin" size={17} /> : <LogIn size={16} />}
              Нэвтрэх
            </button>
          </form>
        ) : (
          <form onSubmit={event => { event.preventDefault(); submitRegistration(); }} className="auth-card">
            <div className="auth-note success" style={{ marginBottom: "16px" }}>Утасны дугаар баталгаажлаа. Одоо нэр (сонголтоор) болон нууц үгээ тохируулаад бүртгэлээ дуусгана уу.</div>
            <label className="auth-field">
              Нэр (сонголтоор)
              <div className="auth-field-shell">
                <UserIcon size={16} aria-hidden="true" />
                <input value={name} onChange={event => setName(event.target.value)} placeholder="Таны нэр" />
              </div>
            </label>
            <label className="auth-field">
              Нууц үг
              <div className="auth-field-shell">
                <Lock size={16} aria-hidden="true" />
                <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="8-с дээш тэмдэгт" autoComplete="new-password" />
              </div>
            </label>

            <button type="submit" disabled={isSubmitting} className="auth-submit">
              {isSubmitting ? <LoaderCircle className="animate-spin" size={17} /> : <UserPlus size={16} />}
              Бүртгэл дуусгах
            </button>
          </form>
        )}

        <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setVerifiedSessionId(null); }} className="auth-switch">
          {mode === "login" ? "Шинэ хэрэглэгч үү? Бүртгүүлэх" : "Бүртгэлтэй юу? Нэвтрэх"}
        </button>
      </main>
      <SiteFooter />
    </div>
  );
}
