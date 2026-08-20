import { useEffect, useRef } from "react";
import { Link, useRoute } from "wouter";
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import CommerceHeader from "@/components/CommerceHeader";
import { trpc } from "@/lib/trpc";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Имэйл хаягийг баталгаажуулж чадсангүй.";

export default function VerifyEmail() {
  const [, params] = useRoute("/verify-email/:token");
  const token = params?.token ?? "";
  const hasValidTokenShape = token.length >= 32;
  const utils = trpc.useUtils();
  const verifyEmail = trpc.auth.verifyEmail.useMutation();
  const attempted = useRef(false);

  useEffect(() => {
    if (!hasValidTokenShape || attempted.current) return;
    attempted.current = true;
    verifyEmail.mutate({ token }, { onSuccess: () => { void utils.auth.me.invalidate(); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidTokenShape, token]);

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

        <div className="rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(20,22,24,.06)] sm:p-8">
          {!hasValidTokenShape ? (
            <>
              <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#fff0f2] text-[#a51630]"><XCircle size={23} /></div>
              <p className="mt-5 text-sm leading-6 text-[#626368]">Холбоос буруу эсвэл дутуу байна.</p>
            </>
          ) : verifyEmail.isPending || verifyEmail.isIdle ? (
            <p className="flex items-center gap-2 text-sm text-[#707176]"><LoaderCircle size={16} className="animate-spin" />Баталгаажуулж байна…</p>
          ) : verifyEmail.isSuccess ? (
            <>
              <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#e7f2ec] text-[#2c7650]"><CheckCircle2 size={23} /></div>
              <p className="mt-5 text-sm leading-6 text-[#626368]">Таны имэйл хаяг амжилттай баталгаажлаа. Баярлалаа!</p>
            </>
          ) : (
            <>
              <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#fff0f2] text-[#a51630]"><XCircle size={23} /></div>
              <p className="mt-5 text-sm leading-6 text-[#a51630]">{messageFrom(verifyEmail.error)}</p>
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
