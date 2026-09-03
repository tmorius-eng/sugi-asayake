import { ArrowLeft, ArrowUpRight, Heart, MailWarning, Menu, ShoppingBag, User, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import HeaderSearch from "@/components/HeaderSearch";
import { trpc } from "@/lib/trpc";

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
  // Design consistency audit (2026-09-02): on mobile, index.css's
  // @media(max-width:760px) rule hides every direct <a> child of
  // .commerce-header-actions to make room ("Дэлгүүр"/wishlist), with no
  // other way to reach them -- CommerceHeader had no hamburger/drawer at
  // all, unlike Home.tsx's own header. This restores those destinations via
  // the same slide-down drawer technique Home.tsx's .mobile-menu already
  // uses (own class names -- .commerce-mobile-menu -- so the two headers'
  // CSS stays independent rather than coupled by a shared class name).
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? null;
  // matsukiyococokara-online.com's header utility row (recently viewed /
  // store locator / favorites / cart, each with a visible count) —
  // wishlist is the one of those four SUGI ASAYAKE has that wasn't
  // reachable from outside /profile at all before this. Query only runs
  // when signed in: a guest has no wishlist to count.
  const wishlistQuery = trpc.profile.wishlist.list.useQuery(undefined, { enabled: Boolean(user) });
  const wishlistCount = wishlistQuery.data?.length ?? 0;

  return (
    <>
      <VerifyEmailBanner />
      <header className="commerce-header">
        <div className="commerce-header-inner">
          <Link href="/" className="commerce-brand">
            <span className="commerce-back"><ArrowLeft size={17} aria-hidden="true" /></span>
            <img src="/manus-storage/sugi-logo-transparent-clean_fee66cad.png" alt="SUGI ASAYAKE" />
            <span>{backLabel}</span>
          </Link>
          <div className="commerce-header-actions">
            <HeaderSearch />
            <Link href="/shop" className={location.startsWith("/shop") ? "is-current" : ""}>Дэлгүүр</Link>
            {user && (
              <Link href="/profile?tab=wishlist" className="wishlist-link" aria-label={wishlistCount > 0 ? `Хүслийн жагсаалт, ${wishlistCount} бараатай` : "Хүслийн жагсаалт"}>
                <Heart size={15} aria-hidden="true" /> Хүслийн жагсаалт
                {wishlistCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-[#f0b52d] text-[10px] text-[#17181b]">{wishlistCount}</span>}
              </Link>
            )}
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
            <button type="button" className="commerce-menu-toggle" aria-expanded={menuOpen} aria-label={menuOpen ? "Цэс хаах" : "Цэс нээх"} onClick={() => setMenuOpen(open => !open)}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        <div className={`commerce-mobile-menu ${menuOpen ? "open" : ""}`}>
          <Link href="/shop" onClick={closeMenu}><span>Дэлгүүр</span><ArrowUpRight size={16} /></Link>
          {user && (
            <Link href="/profile?tab=wishlist" onClick={closeMenu}>
              <span>Хүслийн жагсаалт{wishlistCount > 0 ? ` (${wishlistCount})` : ""}</span><ArrowUpRight size={16} />
            </Link>
          )}
          <Link href="/profile" onClick={closeMenu}><span>Профайл</span><ArrowUpRight size={16} /></Link>
        </div>
      </header>
    </>
  );
}
