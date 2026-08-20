import { ArrowLeft, MailWarning, ShoppingBag } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type CommerceHeaderProps = {
  cartCount?: number;
  onCartOpen?: () => void;
  backLabel?: string;
};

function VerifyEmailBanner() {
  const { user } = useAuth();
  const resend = trpc.auth.resendVerificationEmail.useMutation({
    onSuccess: () => toast.success("Баталгаажуулах имэйл дахин илгээгдлээ. Инбоксоо шалгана уу."),
    onError: error => toast.error(error instanceof Error ? error.message : "Илгээж чадсангүй."),
  });

  if (!user || user.emailVerifiedAt) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-[#fff7e0] px-4 py-2 text-center text-xs font-semibold text-[#8a6a10]">
      <MailWarning size={14} aria-hidden="true" />
      Та имэйл хаягаа баталгаажуулаагүй байна.
      <button
        type="button"
        disabled={resend.isPending}
        onClick={() => resend.mutate({ origin: window.location.origin })}
        className="underline underline-offset-2 hover:text-[#df1f3d] disabled:opacity-60"
      >
        {resend.isPending ? "Илгээж байна…" : "Дахин илгээх"}
      </button>
    </div>
  );
}

export default function CommerceHeader({ cartCount = 0, onCartOpen, backLabel = "SUGI ASAYAKE" }: CommerceHeaderProps) {
  return (
    <>
      <VerifyEmailBanner />
      <header className="commerce-header">
        <div className="commerce-header-inner">
          <Link href="/" className="commerce-brand">
            <span className="commerce-back"><ArrowLeft size={17} aria-hidden="true" /></span>
            <img src="/manus-storage/sugi-logo-transparent-clean_b392050b.png" alt="SUGI ASAYAKE" />
            <span>{backLabel}</span>
          </Link>
          <div className="commerce-header-actions">
            <Link href="/shop">Дэлгүүр</Link>
            <Link href="/orders">Миний захиалга</Link>
            <button type="button" onClick={onCartOpen} aria-label={cartCount > 0 ? `Сагс нээх, ${cartCount} бараатай` : "Сагс нээх"}>
              <ShoppingBag size={15} aria-hidden="true" /> Сагс
              {cartCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-[#f0b52d] text-[10px] text-[#17181b]">{cartCount}</span>}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
