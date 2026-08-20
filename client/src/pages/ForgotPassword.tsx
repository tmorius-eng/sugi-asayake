import { useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, KeyRound, LoaderCircle, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import CommerceHeader from "@/components/CommerceHeader";
import { trpc } from "@/lib/trpc";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хүсэлт амжилтгүй боллоо. Дахин оролдоно уу.";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [, setLocation] = useLocation();
  const requestReset = trpc.auth.requestPasswordReset.useMutation();
  const resetPassword = trpc.auth.resetPassword.useMutation();

  const submitEmail = async () => {
    if (!email.trim()) {
      toast.error("Имэйл хаягаа оруулна уу.");
      return;
    }
    try {
      await requestReset.mutateAsync({ email: email.trim() });
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const submitCode = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error("6 оронтой кодоо оруулна уу.");
      return;
    }
    if (password.length < 8) {
      toast.error("Нууц үг дор хаяж 8 тэмдэгт байх ёстой.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Нууц үг таарахгүй байна.");
      return;
    }
    try {
      await resetPassword.mutateAsync({ email: email.trim(), code: code.trim(), password });
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
          <p className="auth-lede">Бүртгэлтэй имэйл хаягаа оруулбал бид танд 6 оронтой код илгээнэ.</p>
        </div>

        {resetPassword.isSuccess ? (
          <div className="auth-card">
            <div className="auth-status-icon"><CheckCircle2 size={22} aria-hidden="true" /></div>
            <p style={{ color: "#626368", fontSize: "13px", lineHeight: 1.65 }}>Таны нууц үг амжилттай шинэчлэгдлээ. Одоо шинэ нууц үгээрээ нэвтэрч болно.</p>
            <button type="button" onClick={() => setLocation("/login")} className="auth-submit">Нэвтрэх хуудас руу</button>
          </div>
        ) : requestReset.isSuccess ? (
          <form onSubmit={event => { event.preventDefault(); submitCode(); }} className="auth-card">
            <p style={{ fontSize: "13px", lineHeight: 1.65, color: "#626368" }}>
              Хэрэв <strong>{email.trim()}</strong> хаягаар бүртгэл байгаа бол, түүн рүү 6 оронтой код илгээгдлээ (15 минут хүчинтэй). Имэйлээ шалгана уу (спам хавтас руу орсон эсэхийг мөн шалгаарай).
            </p>
            <label className="auth-field">
              Код
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
            <label className="auth-field">
              Шинэ нууц үг
              <div className="auth-field-shell">
                <Lock size={16} aria-hidden="true" />
                <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="8-с дээш тэмдэгт" autoComplete="new-password" />
              </div>
            </label>
            <label className="auth-field">
              Шинэ нууц үг давтах
              <div className="auth-field-shell">
                <Lock size={16} aria-hidden="true" />
                <input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Дахин оруулна уу" autoComplete="new-password" />
              </div>
            </label>

            <button type="submit" disabled={resetPassword.isPending} className="auth-submit">
              {resetPassword.isPending && <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />}
              Нууц үг шинэчлэх
            </button>
            <button type="button" disabled={requestReset.isPending} onClick={submitEmail} className="auth-quiet">
              {requestReset.isPending ? "Илгээж байна…" : "Код ирээгүй юу? Дахин илгээх"}
            </button>
          </form>
        ) : (
          <form onSubmit={event => { event.preventDefault(); submitEmail(); }} className="auth-card">
            <label className="auth-field">
              Имэйл
              <div className="auth-field-shell">
                <Mail size={16} aria-hidden="true" />
                <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@email.com" autoComplete="email" autoFocus />
              </div>
            </label>

            <button type="submit" disabled={requestReset.isPending} className="auth-submit">
              {requestReset.isPending && <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />}
              Сэргээх код илгээх
            </button>
          </form>
        )}

        <Link href="/login" className="auth-switch">Нэвтрэх хуудас руу буцах</Link>
      </main>
    </div>
  );
}
