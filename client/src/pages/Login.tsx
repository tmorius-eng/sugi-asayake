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
      <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]">
        <CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE" />
        <main className="mx-auto flex max-w-md flex-col px-4 py-14 sm:px-8">
          <div className="mb-8 border-l-4 border-[#df1f3d] pl-5">
            <p className="text-[10px] font-extrabold tracking-[.18em] text-[#df1f3d]">02 / CONFIRM EMAIL</p>
            <h1 className="mt-3 font-[var(--font-display)] text-4xl font-semibold tracking-[-.06em]">
              Кодоо <span className="text-[#df1f3d]">оруулна уу.</span>
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#626368]">
              <strong>{pendingEmail}</strong> хаяг руу 6 оронтой баталгаажуулах код илгээлээ (15 минут хүчинтэй).
            </p>
          </div>

          <form
            onSubmit={event => { event.preventDefault(); submitCode(); }}
            className="space-y-4 rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(20,22,24,.06)] sm:p-8"
          >
            <label className="grid gap-2 text-xs font-bold">
              Баталгаажуулах код
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#c8112e] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isSubmitting && <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />}
              Баталгаажуулж бүртгэл дуусгах
            </button>
          </form>

          <div className="mt-5 flex flex-col items-center gap-2 text-center text-xs font-bold text-[#6c6d72]">
            <button type="button" disabled={resendCode.isPending} onClick={resend} className="transition hover:text-[#df1f3d] disabled:opacity-60">
              {resendCode.isPending ? "Илгээж байна…" : "Код ирээгүй юу? Дахин илгээх"}
            </button>
            <button type="button" onClick={() => { setPendingEmail(null); setCode(""); }} className="transition hover:text-[#df1f3d]">
              Имэйлээ өөрчлөх
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]">
      <CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE" />
      <main className="mx-auto flex max-w-md flex-col px-4 py-14 sm:px-8">
        <div className="mb-8 border-l-4 border-[#df1f3d] pl-5">
          <p className="text-[10px] font-extrabold tracking-[.18em] text-[#df1f3d]">
            {mode === "login" ? "01 / SIGN IN" : "01 / CREATE ACCOUNT"}
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-4xl font-semibold tracking-[-.06em]">
            {mode === "login" ? <>Дахин <span className="text-[#df1f3d]">тавтай морил.</span></> : <>Бүртгэл <span className="text-[#df1f3d]">үүсгэх.</span></>}
          </h1>
        </div>

        <form
          onSubmit={event => { event.preventDefault(); submit(); }}
          className="space-y-4 rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(20,22,24,.06)] sm:p-8"
        >
          {mode === "register" && (
            <label className="grid gap-2 text-xs font-bold">
              Нэр (сонголтоор)
              <div className="flex items-center gap-2 rounded-xl border border-black/12 bg-[#fffdf9] px-3">
                <UserIcon size={16} className="text-[#a9a49a]" />
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder="Таны нэр"
                  className="h-11 flex-1 bg-transparent text-sm font-normal outline-none"
                />
              </div>
            </label>
          )}
          <label className="grid gap-2 text-xs font-bold">
            Имэйл
            <div className="flex items-center gap-2 rounded-xl border border-black/12 bg-[#fffdf9] px-3">
              <Mail size={16} className="text-[#a9a49a]" />
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="name@email.com"
                className="h-11 flex-1 bg-transparent text-sm font-normal outline-none"
                autoComplete="email"
              />
            </div>
          </label>
          <label className="grid gap-2 text-xs font-bold">
            Нууц үг
            <div className="flex items-center gap-2 rounded-xl border border-black/12 bg-[#fffdf9] px-3">
              <Lock size={16} className="text-[#a9a49a]" />
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder={mode === "register" ? "8-с дээш тэмдэгт" : "••••••••"}
                className="h-11 flex-1 bg-transparent text-sm font-normal outline-none"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
          </label>
          {mode === "login" && (
            <div className="text-right">
              <Link href="/forgot-password" className="text-xs font-bold text-[#6c6d72] transition hover:text-[#df1f3d]">
                Нууц үгээ мартсан уу?
              </Link>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#c8112e] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isSubmitting ? <LoaderCircle className="animate-spin" size={17} /> : mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
            {mode === "login" ? "Нэвтрэх" : "Бүртгүүлэх"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-5 text-center text-xs font-bold text-[#6c6d72] transition hover:text-[#df1f3d]"
        >
          {mode === "login" ? "Шинэ хэрэглэгч үү? Бүртгүүлэх" : "Бүртгэлтэй юу? Нэвтрэх"}
        </button>
      </main>
    </div>
  );
}
