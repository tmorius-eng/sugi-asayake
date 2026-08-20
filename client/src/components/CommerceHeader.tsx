import { ArrowLeft, MailWarning, ShoppingBag, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

type CommerceHeaderProps = {
  cartCount?: number;
  onCartOpen?: () => void;
  backLabel?: string;
};

function VerifyEmailBanner() {
  const { user } = useAuth();

  if (!user || user.emailVerifiedAt) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-[#fff7e0] px-4 py-2 text-center text-xs font-semibold text-[#8a6a10]">
      <MailWarning size={14} aria-hidden="true" />
      Та имэйл хаягаа баталгаажуулаагүй байна.
      <Link href="/verify-email" className="underline underline-offset-2 hover:text-[#df1f3d]">
        Баталгаажуулах код оруулах
      </Link>
    </div>
  );
}

export default function CommerceHeader({ cartCount = 0, onCartOpen, backLabel = "SUGI ASAYAKE" }: CommerceHeaderProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? null;

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
            <Link href="/shop" className={location.startsWith("/shop") ? "is-current" : ""}>Дэлгүүр</Link>
            {/* Order history lives inside Профайл -> Захиалга (with a
                buy-again + status timeline the old standalone "Миний
                захиалга" link didn't have) — one nav entry into the account
                area instead of two links to overlapping content. */}
            <Link href="/profile" className={`profile-link${location.startsWith("/profile") ? " is-current" : ""}`} aria-label="Миний профайл">
              {user ? (
                <span className="profile-avatar-chip">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initial}</span>
              ) : (
                <User size={15} aria-hidden="true" />
              )}
              <span>Профайл</span>
            </Link>
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
