import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { KeyRound, LoaderCircle, Lock, LogIn, Mail, User as UserIcon, UserPlus } from "lucide-react";
import { toast } from "sonner";
import CommerceHeader from "@/components/CommerceHeader";
import { trpc } from "@/lib/trpc";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хүсэлт амжилтгүй боллоо. Дахин оролдоно уу.";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  // Set once auth.register creates a pending (unconfirmed) account — from
  // then on this page shows the "enter the code we emailed you" step instead
  // of the register form, until auth.confirmRegistration succeeds.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const utils = trpc.useUtils();

  const redirectTarget = (() => {
    const params = new URLSearchParams(search);
    const target = params.get("redirect");
    return target && target.startsWith("/") ? target : "/";
  })();

  const loginMutation = trpc.auth.login.useMutation();
  const registerMutation = trpc.auth.register.useMutation();
  const confirmRegistration = trpc.auth.confirmRegistration.useMutation();
  const resendCode = trpc.auth.resendRegistrationCode.useMutation();
  const isSubmitting = loginMutation.isPending || registerMutation.isPending || confirmRegistration.isPending;

  const afterSuccess = async () => {
    await utils.auth.me.invalidate();
    setLocation(redirectTarget);
  };

  const submit = async () => {
    if (!email.trim() || !password) {
      toast.error("Имэйл болон нууц үгээ оруулна уу.");
      return;
    }
    try {
      if (mode === "login") {
        await loginMutation.mutateAsync({ email: email.trim(), password });
        await afterSuccess();
      } else {
        const result = await registerMutation.mutateAsync({ email: email.trim(), password, name: name.trim() || undefined });
        setPendingEmail(result.email);
        if (!result.codeSent) toast.message("Баталгаажуулах кодыг сервер лог руу бичлээ (Brevo холбогдоогүй байна).");
      }
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const submitCode = async () => {
    if (!pendingEmail) return;
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error("6 оронтой кодоо оруулна уу.");
      return;
    }
    try {
      await confirmRegistration.mutateAsync({ email: pendingEmail, code: code.trim() });
      await afterSuccess();
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const resend = async () => {
    if (!pendingEmail) return;
    try {
      await resendCode.mutateAsync({ email: pendingEmail });
      toast.success("Шинэ код илгээлээ. Инбоксоо шалгана уу.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  if (pendingEmail) {
    return (
      <div className="auth-shell">
        <CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE" />
        <main className="auth-main">
          <div className="auth-head">
            <p className="auth-kicker">02 / CONFIRM EMAIL</p>
            <h1>Кодоо <em>оруулна уу.</em></h1>
            <p className="auth-lede"><strong>{pendingEmail}</strong> хаяг руу 6 оронтой баталгаажуулах код илгээлээ (15 минут хүчинтэй).</p>
          </div>

          <form onSubmit={event => { event.preventDefault(); submitCode(); }} className="auth-card">
            <label className="auth-field">
              Баталгаажуулах код
              <div className="auth-field-shell otp">
                <KeyRound size={16} aria-hidden="true" />
                <input
                  value={code}
                  onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
            </label>

            <button type="submit" disabled={isSubmitting} className="auth-submit">
              {isSubmitting && <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />}
              Баталгаажуулж бүртгэл дуусгах
            </button>
          </form>

          <button type="button" disabled={resendCode.isPending} onClick={resend} className="auth-quiet" style={{ marginTop: "18px" }}>
            {resendCode.isPending ? "Илгээж байна…" : "Код ирээгүй юу? Дахин илгээх"}
          </button>
          <button type="button" onClick={() => { setPendingEmail(null); setCode(""); }} className="auth-quiet" style={{ marginTop: "10px" }}>
            Имэйлээ өөрчлөх
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE" />
      <main className="auth-main">
        <div className="auth-head">
          <p className="auth-kicker">{mode === "login" ? "01 / SIGN IN" : "01 / CREATE ACCOUNT"}</p>
          <h1>{mode === "login" ? <>Дахин <em>тавтай морил.</em></> : <>Бүртгэл <em>үүсгэх.</em></>}</h1>
        </div>

        <form onSubmit={event => { event.preventDefault(); submit(); }} className="auth-card">
          {mode === "register" && (
            <label className="auth-field">
              Нэр (сонголтоор)
              <div className="auth-field-shell">
                <UserIcon size={16} aria-hidden="true" />
                <input value={name} onChange={event => setName(event.target.value)} placeholder="Таны нэр" />
              </div>
            </label>
          )}
          <label className="auth-field">
            Имэйл
            <div className="auth-field-shell">
              <Mail size={16} aria-hidden="true" />
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@email.com" autoComplete="email" />
            </div>
          </label>
          <label className="auth-field">
            Нууц үг
            <div className="auth-field-shell">
              <Lock size={16} aria-hidden="true" />
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder={mode === "register" ? "8-с дээш тэмдэгт" : "••••••••"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
          </label>
          {mode === "login" && (
            <div style={{ textAlign: "right" }}>
              <Link href="/forgot-password" className="auth-quiet" style={{ display: "inline" }}>Нууц үгээ мартсан уу?</Link>
            </div>
          )}

          <button type="submit" disabled={isSubmitting} className="auth-submit">
            {isSubmitting ? <LoaderCircle className="animate-spin" size={17} /> : mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
            {mode === "login" ? "Нэвтрэх" : "Бүртгүүлэх"}
          </button>
        </form>

        <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="auth-switch">
          {mode === "login" ? "Шинэ хэрэглэгч үү? Бүртгүүлэх" : "Бүртгэлтэй юу? Нэвтрэх"}
        </button>
      </main>
    </div>
  );
}
