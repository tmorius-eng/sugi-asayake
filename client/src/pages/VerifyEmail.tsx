import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import CommerceHeader from "@/components/CommerceHeader";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Имэйл хаягийг баталгаажуулж чадсангүй.";

export default function VerifyEmail() {
  const { user, loading } = useAuth();
  const [code, setCode] = useState("");
  const utils = trpc.useUtils();
  const resend = trpc.auth.resendVerificationEmail.useMutation();
  const verifyCode = trpc.auth.verifyEmailCode.useMutation({ onSuccess: () => { void utils.auth.me.invalidate(); } });
  // Auto-send a code the first time this page mounts for an unverified user,
  // without re-sending on every re-render.
  const autoSent = useRef(false);

  useEffect(() => {
    if (loading || !user || user.emailVerifiedAt || autoSent.current) return;
    autoSent.current = true;
    resend.mutate(undefined, { onSuccess: result => { if (!result.alreadyVerified) toast.success("Баталгаажуулах код илгээлээ. Инбоксоо шалгана уу."); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const submit = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error("6 оронтой кодоо оруулна уу.");
      return;
    }
    try {
      await verifyCode.mutateAsync({ code: code.trim() });
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]">
      <CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE" />
      <main className="mx-auto flex max-w-md flex-col px-4 py-14 sm:px-8">
        <div className="mb-8 border-l-4 border-[#df1f3d] pl-5">
          <p className="text-[10px] font-extrabold tracking-[.18em] text-[#df1f3d]">EMAIL VERIFICATION</p>
          <h1 className="mt-3 font-[var(--font-display)] text-4xl font-semibold tracking-[-.06em]">
            Имэйл <span className="text-[#df1f3d]">баталгаажуулалт.</span>
          </h1>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(20,22,24,.06)] sm:p-8" role="status" aria-live="polite">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-[#707176]"><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />Уншиж байна…</p>
          ) : !user ? (
            <p className="text-sm leading-6 text-[#a51630]">Энэ хуудсыг үзэхийн тулд эхлээд нэвтэрнэ үү.</p>
          ) : user.emailVerifiedAt || verifyCode.isSuccess ? (
            <>
              <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#e7f2ec] text-[#2c7650]"><CheckCircle2 size={23} aria-hidden="true" /></div>
              <p className="mt-5 text-sm leading-6 text-[#626368]">Таны имэйл хаяг амжилттай баталгаажлаа. Баярлалаа!</p>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-[#626368]">
                <strong>{user.email}</strong> хаяг руу 6 оронтой баталгаажуулах код илгээлээ (15 минут хүчинтэй).
              </p>
              <form
                onSubmit={event => { event.preventDefault(); submit(); }}
                className="mt-5 space-y-4"
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
                  disabled={verifyCode.isPending}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#c8112e] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {verifyCode.isPending && <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />}
                  Баталгаажуулах
                </button>
                <button
                  type="button"
                  disabled={resend.isPending}
                  onClick={() => resend.mutate(undefined, { onSuccess: () => toast.success("Шинэ код илгээлээ.") })}
                  className="w-full text-center text-xs font-bold text-[#6c6d72] transition hover:text-[#df1f3d] disabled:opacity-60"
                >
                  {resend.isPending ? "Илгээж байна…" : "Код ирээгүй юу? Дахин илгээх"}
                </button>
              </form>
            </>
          )}
          <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#df1f3d] hover:underline">
            Нүүр хуудас руу буцах
          </Link>
        </div>
      </main>
    </div>
  );
}
