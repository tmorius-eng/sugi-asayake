import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { CheckCircle2, LoaderCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import CommerceHeader from "@/components/CommerceHeader";
import { trpc } from "@/lib/trpc";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Нууц үг сэргээж чадсангүй. Дахин оролдоно уу.";

export default function ResetPassword() {
  const [, params] = useRoute("/reset-password/:token");
  const token = params?.token ?? "";
  const hasValidTokenShape = token.length >= 32;
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const resetPassword = trpc.auth.resetPassword.useMutation();

  const submit = async () => {
    if (password.length < 8) {
      toast.error("Нууц үг дор хаяж 8 тэмдэгт байх ёстой.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Нууц үг таарахгүй байна.");
      return;
    }
    try {
      await resetPassword.mutateAsync({ token, password });
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
            Шинэ <span className="text-[#df1f3d]">нууц үг.</span>
          </h1>
        </div>

        {!hasValidTokenShape ? (
          <div className="rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(20,22,24,.06)] sm:p-8">
            <div className="rounded-2xl bg-[#fff0f2] p-4 text-sm leading-6 text-[#a51630]">
              Холбоос буруу эсвэл дутуу байна. Нууц үг сэргээх хүсэлтээ дахин илгээнэ үү.
            </div>
            <Link href="/forgot-password" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#df1f3d] hover:underline">
              Дахин хүсэлт илгээх
            </Link>
          </div>
        ) : resetPassword.isSuccess ? (
          <div className="rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(20,22,24,.06)] sm:p-8">
            <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#e7f2ec] text-[#2c7650]">
              <CheckCircle2 size={23} />
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
        ) : (
          <form
            onSubmit={event => { event.preventDefault(); submit(); }}
            className="space-y-4 rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(20,22,24,.06)] sm:p-8"
          >
            <label className="grid gap-2 text-xs font-bold">
              Шинэ нууц үг
              <div className="flex items-center gap-2 rounded-xl border border-black/12 bg-[#fffdf9] px-3">
                <Lock size={16} className="text-[#a9a49a]" />
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="8-с дээш тэмдэгт"
                  className="h-11 flex-1 bg-transparent text-sm font-normal outline-none"
                  autoComplete="new-password"
                  autoFocus
                />
              </div>
            </label>
            <label className="grid gap-2 text-xs font-bold">
              Шинэ нууц үг давтах
              <div className="flex items-center gap-2 rounded-xl border border-black/12 bg-[#fffdf9] px-3">
                <Lock size={16} className="text-[#a9a49a]" />
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
              {resetPassword.isPending && <LoaderCircle className="animate-spin" size={17} />}
              Нууц үг шинэчлэх
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
