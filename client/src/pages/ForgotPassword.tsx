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
    <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]">
      <CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE" />
      <main className="mx-auto flex max-w-md flex-col px-4 py-14 sm:px-8">
        <div className="mb-8 border-l-4 border-[#df1f3d] pl-5">
          <p className="text-[10px] font-extrabold tracking-[.18em] text-[#df1f3d]">ACCOUNT RECOVERY</p>
          <h1 className="mt-3 font-[var(--font-display)] text-4xl font-semibold tracking-[-.06em]">
            Нууц үгээ <span className="text-[#df1f3d]">сэргээх.</span>
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#626368]">Бүртгэлтэй имэйл хаягаа оруулбал бид танд 6 оронтой код илгээнэ.</p>
        </div>

        {resetPassword.isSuccess ? (
          <div className="rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(20,22,24,.06)] sm:p-8">
            <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#e7f2ec] text-[#2c7650]">
              <CheckCircle2 size={23} aria-hidden="true" />
            </div>
            <p className="mt-5 text-sm leading-6 text-[#626368]">Таны нууц үг амжилттай шинэчлэгдлээ. Одоо шинэ нууц үгээрээ нэвтэрч болно.</p>
            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#c8112e] active:scale-[.97]"
            >
              Нэвтрэх хуудас руу
            </button>
          </div>
        ) : requestReset.isSuccess ? (
          <form
            onSubmit={event => { event.preventDefault(); submitCode(); }}
            className="space-y-4 rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(20,22,24,.06)] sm:p-8"
          >
            <p className="text-sm leading-6 text-[#626368]">
              Хэрэв <strong>{email.trim()}</strong> хаягаар бүртгэл байгаа бол, түүн рүү 6 оронтой код илгээгдлээ (15 минут хүчинтэй). Имэйлээ шалгана уу (спам хавтас руу орсон эсэхийг мөн шалгаарай).
            </p>
            <label className="grid gap-2 text-xs font-bold">
              Код
              <div className="flex items-center gap-2 rounded-xl border border-black/12 bg-[#fffdf9] px-3">
                <KeyRound size={16} className="text-[#a9a49a]" aria-hidden="true" />
                <input
                  value={code}
                  onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  className="h-11 flex-1 bg-transparent text-center text-lg font-bold tracking-[.3em] outline-none"
                />
              </div>
            </label>
            <label className="grid gap-2 text-xs font-bold">
              Шинэ нууц үг
              <div className="flex items-center gap-2 rounded-xl border border-black/12 bg-[#fffdf9] px-3">
                <Lock size={16} className="text-[#a9a49a]" aria-hidden="true" />
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="8-с дээш тэмдэгт"
                  className="h-11 flex-1 bg-transparent text-sm font-normal outline-none"
                  autoComplete="new-password"
                />
              </div>
            </label>
            <label className="grid gap-2 text-xs font-bold">
              Шинэ нууц үг давтах
              <div className="flex items-center gap-2 rounded-xl border border-black/12 bg-[#fffdf9] px-3">
                <Lock size={16} className="text-[#a9a49a]" aria-hidden="true" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  placeholder="Дахин оруулна уу"
                  className="h-11 flex-1 bg-transparent text-sm font-normal outline-none"
                  autoComplete="new-password"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={resetPassword.isPending}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#c8112e] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {resetPassword.isPending && <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />}
              Нууц үг шинэчлэх
            </button>
            <button type="button" disabled={requestReset.isPending} onClick={submitEmail} className="w-full text-center text-xs font-bold text-[#6c6d72] transition hover:text-[#df1f3d] disabled:opacity-60">
              {requestReset.isPending ? "Илгээж байна…" : "Код ирээгүй юу? Дахин илгээх"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={event => { event.preventDefault(); submitEmail(); }}
            className="space-y-4 rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(20,22,24,.06)] sm:p-8"
          >
            <label className="grid gap-2 text-xs font-bold">
              Имэйл
              <div className="flex items-center gap-2 rounded-xl border border-black/12 bg-[#fffdf9] px-3">
                <Mail size={16} className="text-[#a9a49a]" aria-hidden="true" />
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="name@email.com"
                  className="h-11 flex-1 bg-transparent text-sm font-normal outline-none"
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={requestReset.isPending}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#c8112e] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {requestReset.isPending && <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />}
              Сэргээх код илгээх
            </button>
          </form>
        )}

        <Link href="/login" className="mt-5 text-center text-xs font-bold text-[#6c6d72] transition hover:text-[#df1f3d]">
          Нэвтрэх хуудас руу буцах
        </Link>
      </main>
    </div>
  );
}
