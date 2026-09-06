import { ArrowLeft, ArrowUpRight, Heart, Menu, ShoppingBag, User, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import HeaderSearch from "@/components/HeaderSearch";
import { trpc } from "@/lib/trpc";

type CommerceHeaderProps = {
  cartCount?: number;
  onCartOpen?: () => void;
  backLabel?: string;
  // NEWVISION.md §8: Home used to render its own separate <header> (no
  // cart button, no profile/wishlist links at all -- a signed-in shopper
  // browsing the homepage had no way to see their cart or reach their
  // account without navigating to /shop first). marketingNav adds a second,
  // plain-text nav row of homepage-section anchors -- deliberately only
  // meaningful on the page that owns those sections, so every other caller
  // leaves this unset and renders exactly as before.
  marketingNav?: boolean;
};

// Anchor hrefs match Home.tsx's own existing #story/#collection/#stores
// convention (plain <a>, not wouter <Link> -- same-page fragment jumps
// don't need client-side routing). Only ever rendered on Home (marketingNav
// is opt-in per caller), so these are safe as bare fragments.
//
// Tom, 2026-09-05: the last item was the plain-Latin "Journal" sitting next
// to 4 Cyrillic labels -- --font-body is "DM Sans, Noto Sans Mongolian,
// sans-serif", and DM Sans has no Cyrillic glyphs, so the browser fell back
// to Noto Sans Mongolian per-character for the other 4 labels while
// "Journal"'s Latin letters rendered directly in DM Sans -- one CSS rule,
// two different physical typefaces side by side. Matching this label's
// script to its siblings (instead of forcing a font override) fixes it at
// the root; Journal.tsx's own "SUGI JOURNAL" kicker is a separate,
// deliberate editorial mark and is unaffected.
const marketingNavItems = [
  { label: "Дэлгүүр", href: "/shop", anchor: false },
  { label: "Топ брэнд", href: "#top-brands", anchor: true },
  { label: "Гишүүнчлэл", href: "#membership", anchor: true },
  { label: "Салбарууд", href: "#stores", anchor: true },
  { label: "Зөвлөгөө", href: "/journal", anchor: false },
];

export default function CommerceHeader({ cartCount = 0, onCartOpen, backLabel = "SUGI ASAYAKE", marketingNav = false }: CommerceHeaderProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  // The circular back-arrow means "return to the homepage" -- meaningless
  // (and previously just a same-page no-op link) on the homepage itself.
  const isHome = location === "/";
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
      <header className="commerce-header">
        <div className="commerce-header-inner">
          {/* Tom, 2026-09-05: on Home the logo image already carries the
              "SUGI ASAYAKE" wordmark -- a plain-text repeat of it right next
              to the image read as redundant, so marketingNav (only ever true
              on Home) drops that trailing <span>. Same call on /shop
              (Tom, explicit) -- Shop.tsx now passes backLabel="" instead of
              text, and an empty/falsy backLabel renders nothing here. Every
              other page still passes real text and keeps it (paired with
              the back-arrow, it names the section you'd return from, e.g.
              "SUGI ASAYAKE профайл") -- untouched. */}
          <div className="commerce-header-left">
            <Link href="/" className="commerce-brand">
              {!isHome && <span className="commerce-back"><ArrowLeft size={17} aria-hidden="true" /></span>}
              <img src="/cdn/sugi-logo-transparent-clean_fee66cad.png" alt="SUGI ASAYAKE" />
              {!marketingNav && backLabel ? <span>{backLabel}</span> : null}
            </Link>
            {/* Moved to sit directly beside the logo instead of its own
                full-width row below the header -- same nav, same items. */}
            {marketingNav && (
              <nav className="commerce-marketing-nav" aria-label="Нүүр хуудасны цэс">
                {marketingNavItems.map(item => item.anchor
                  ? <a href={item.href} key={item.label}>{item.label}</a>
                  : <Link href={item.href} key={item.label}>{item.label}</Link>)}
              </nav>
            )}
          </div>
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
          {/* "Дэлгүүр" already covered by the link above -- avoid listing it twice. */}
          {marketingNav && marketingNavItems.filter(item => item.label !== "Дэлгүүр").map(item => item.anchor
            ? <a href={item.href} key={item.label} onClick={closeMenu}><span>{item.label}</span><ArrowUpRight size={16} /></a>
            : <Link href={item.href} key={item.label} onClick={closeMenu}><span>{item.label}</span><ArrowUpRight size={16} /></Link>)}
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
