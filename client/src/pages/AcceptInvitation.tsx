import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { Link, useRoute } from "wouter";

const errorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("too_small") || message.includes("Too small") || message.includes("token")) {
    return "Урилгын холбоос буруу эсвэл дутуу байна. Админаасаа шинэ, бүрэн холбоос аваарай.";
  }
  return message || "Урилгыг хүлээн авч чадсангүй. Дахин оролдоно уу.";
};

export default function AcceptInvitation() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token ?? "";
  const hasValidTokenShape = token.length >= 32;
  const { user, loading } = useAuth();
  const details = trpc.invites.details.useQuery({ token }, { enabled: hasValidTokenShape, retry: false });
  const accept = trpc.invites.accept.useMutation();

  const beginSignIn = () => {
    sessionStorage.setItem("sugi-pending-invite", token);
    startLogin();
  };

  const acceptInvitation = async () => {
    try {
      await accept.mutateAsync({ token });
      sessionStorage.removeItem("sugi-pending-invite");
    } catch {
      // The structured mutation error is displayed below.
    }
  };

  const statusMessage = !hasValidTokenShape ? "Урилгын холбоос буруу эсвэл дутуу байна. Админаасаа шинэ, бүрэн холбоос аваарай." : details.error ? errorMessage(details.error) : details.data && !details.data.valid ? details.data.message : null;
  const expiration = details.data?.valid && details.data.expiresAt ? new Date(details.data.expiresAt) : null;

  return <main className="min-h-screen bg-[#f8f5ef] px-5 py-10 sm:px-8 sm:py-16"><div className="mx-auto max-w-xl rounded-[2rem] bg-white p-7 shadow-[0_20px_56px_rgba(20,22,24,.10)] sm:p-10"><div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#fff0f2] text-[#df1f3d]"><ShieldCheck size={23} /></div><p className="mt-6 text-[10px] font-extrabold tracking-[.16em] text-[#df1f3d]">SUGI ASAYAKE · STAFF ACCESS</p><h1 className="mt-2 font-[var(--font-display)] text-4xl font-semibold tracking-[-.07em] text-[#17181b]">Багийн урилга.</h1>{(loading || details.isLoading) && <p className="mt-5 flex items-center gap-2 text-sm text-[#707176]"><LoaderCircle size={16} className="animate-spin" />Урилгын мэдээллийг шалгаж байна…</p>}{statusMessage && <div className="mt-5 rounded-2xl bg-[#fff0f2] p-4 text-sm leading-6 text-[#a51630]">{statusMessage}</div>}{details.data?.valid && <><p className="mt-5 text-sm leading-6 text-[#626368]">Та <strong>{details.data.email}</strong> имэйлд илгээсэн <strong>{details.data.role === "admin" ? "админ" : "ажилтан"}</strong> эрхийн урилгыг хүлээн авах гэж байна. Урилга {expiration?.toLocaleDateString("mn-MN") ?? "—"} хүртэл хүчинтэй.</p>{!user && <button type="button" onClick={beginSignIn} className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#bc1732] active:scale-[.97]">Нэвтэрч үргэлжлүүлэх</button>}{user && <><div className="mt-5 rounded-2xl bg-[#f1f6fb] p-4 text-xs leading-5 text-[#3970a7]">Та <strong>{user.email ?? "имэйлгүй бүртгэл"}</strong> хаягаар нэвтэрсэн байна. Энэ нь урилгын имэйлтэй таарах ёстой.</div><button type="button" disabled={accept.isPending} onClick={acceptInvitation} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#bc1732] disabled:opacity-60">{accept.isPending && <LoaderCircle size={16} className="animate-spin" />}Урилгыг хүлээн авах</button>{accept.isSuccess && <div className="mt-5 rounded-2xl bg-[#e7f2ec] p-4 text-sm leading-6 text-[#2c7650]"><CheckCircle2 className="mr-2 inline-block" size={16} />Эрх амжилттай идэвхжлээ. <Link href={accept.data.role === "admin" ? "/admin" : "/"} className="font-bold underline">Үргэлжлүүлэх</Link></div>}{accept.error && <div className="mt-4 rounded-2xl bg-[#fff0f2] p-4 text-sm leading-6 text-[#a51630]">{errorMessage(accept.error)}</div>}</>}</>}</div></main>;
}
