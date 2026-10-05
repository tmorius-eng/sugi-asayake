import { ArrowLeft, ArrowUpRight, ChevronRight, Heart, Menu, Moon, ShoppingBag, Sun, User, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import HeaderSearch from "@/components/HeaderSearch";
import InstallAppButton from "@/components/InstallAppButton";
import NotificationOptIn from "@/components/NotificationOptIn";
import LocaleSwitch from "@/components/LocaleSwitch";
import { useCategories } from "@/hooks/useCategories";
import { useBrandMedia } from "@/hooks/useBrandMedia";
import { useSiteText } from "@/hooks/useSiteText";
import { toggleStorefrontTheme, useStorefrontTheme } from "@/hooks/useStorefrontTheme";
import { useT } from "@/hooks/useLocale";
import { trpc } from "@/lib/trpc";
import CartDrawer from "@/components/CartDrawer";
import { brandName } from "@/lib/brand";

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
// 2026-09-12: the five labels are admin-editable site-text slots; the hrefs
// stay in code because they are real routes/anchors, not copy -- renaming
// "Зөвлөгөө" must never be able to break the link to /journal.
const marketingNavItems = [
  { slot: "nav-text-shop", fallback: "Дэлгүүр", href: "/shop", anchor: false },
  { slot: "nav-text-brands", fallback: "Топ брэнд", href: "#top-brands", anchor: true },
  { slot: "nav-text-membership", fallback: "Гишүүнчлэл", href: "#membership", anchor: true },
  { slot: "nav-text-stores", fallback: "Салбарууд", href: "#stores", anchor: true },
  { slot: "nav-text-journal", fallback: "Зөвлөгөө", href: "/journal", anchor: false },
];

export default function CommerceHeader({ cartCount: cartCountProp, onCartOpen: onCartOpenProp, backLabel = brandName(), marketingNav = false }: CommerceHeaderProps) {
  // 2026-09-21: a page that does not wire its own cart (journal, brands, posts,
  // track-order, login, legal, help, checkout...) used to get a DEAD bag icon --
  // always "empty", and clicking it did nothing, because onCartOpen was
  // undefined. The header now owns the cart itself in that case: live count
  // from the same cart query every other surface uses, and its own drawer.
  // Pages that already manage a drawer (home, shop, product, routine, profile)
  // pass onCartOpen and are unchanged.
  const selfManagedCart = onCartOpenProp === undefined;
  const ownCartQuery = trpc.cart.current.useQuery(undefined, { enabled: selfManagedCart });
  const [ownCartOpen, setOwnCartOpen] = useState(false);
  const cartCount = selfManagedCart
    ? ownCartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0
    : cartCountProp ?? 0;
  const onCartOpen = onCartOpenProp ?? (() => setOwnCartOpen(true));
  const { user } = useAuth();
  const [location] = useLocation();
  const textFor = useSiteText();
  const categories = useCategories();
  const { logo: brandLogo } = useBrandMedia();
  const theme = useStorefrontTheme();
  const t = useT();
  // Resolved once so the desktop nav and the mobile drawer can never show
  // two different labels for the same link.
  const navItems = marketingNavItems.map(item => ({ ...item, label: textFor(item.slot, item.fallback) }));
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
              <img src={brandLogo ?? undefined} alt={brandName()} />
              {!marketingNav && backLabel ? <span>{backLabel}</span> : null}
            </Link>
          </div>
          {/* Tom, 2026-09-12: the search field sits on the logo's own line
              ("ene search bariig logo giin neg shugamnd bailga") -- it was a
              row of its own underneath, which left the logo and the field on
              two different lines. The marketing nav takes the row below
              instead, centred. */}
          <div className="commerce-header-search-slot">
            <HeaderSearch variant="inline" />
          </div>
          <div className="commerce-header-actions">
            {/* Below ~460px the field itself would be narrower than its own
                placeholder, so it collapses to the magnifier and opens the
                same panel (Tom: "suulde bur sizen ulam jijig bolwol search
                bar bish search icon hurtel bolgdog responsive bolgo"). CSS
                decides which of the two is on screen; they are the same
                component and the same catalog.search call. */}
            <div className="header-search-compact"><HeaderSearch /></div>
            {/* Light/dark for the storefront (Tom). It carries its own
                attribute on <html>, not the `.dark` class every Tailwind
                `dark:` utility keys off, so /admin keeps its own theme. */}
            <LocaleSwitch />
            <button
              type="button"
              className="header-theme-toggle"
              onClick={toggleStorefrontTheme}
              aria-label={theme === "dark" ? t("Цайвар загвар") : t("Харанхуй загвар")}
              title={theme === "dark" ? t("Цайвар загвар") : t("Харанхуй загвар")}
              aria-pressed={theme === "dark"}
            >
              {theme === "dark" ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
            </button>
            {/* 2026-09-12 (Tom): the plain-text "Дэлгүүр" link is gone from
                the header entirely. On Home the marketing nav already leads
                with it; on every other page the bottom bar (phone) and the
                drawer carry it, and the reference header this was restyled
                against has no text link beside its icons. */}
            {user && (
              <Link href="/profile?tab=wishlist" className="wishlist-link" aria-label={wishlistCount > 0 ? `Хүслийн жагсаалт, ${wishlistCount} бараатай` : "Хүслийн жагсаалт"}>
                <Heart size={19} aria-hidden="true" />
                {/* The label stays in the DOM for a screen reader and for
                    the mobile drawer; the header itself shows icons only,
                    as the reference does. */}
                <span className="header-action-label">{t("Хүслийн жагсаалт")}</span>
                {wishlistCount > 0 && <span className="header-action-count" aria-hidden="true">{wishlistCount}</span>}
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
                <User size={19} aria-hidden="true" />
              )}
              <span className="header-action-label">{t("Профайл")}</span>
            </Link>
            <button type="button" onClick={onCartOpen} aria-label={cartCount > 0 ? `Сагс нээх, ${cartCount} бараатай` : "Сагс нээх"}>
              <ShoppingBag size={19} aria-hidden="true" />
              <span className="header-action-label">{t("Сагс")}</span>
              {cartCount > 0 && <span className="header-action-count" aria-hidden="true">{cartCount}</span>}
            </button>
            <button type="button" className="commerce-menu-toggle" aria-expanded={menuOpen} aria-label={menuOpen ? "Цэс хаах" : "Цэс нээх"} onClick={() => setMenuOpen(open => !open)}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {marketingNav && (
          <nav className="commerce-header-navrow commerce-marketing-nav" aria-label="Нүүр хуудасны цэс">
            {navItems.map(item => item.anchor
              ? <a href={item.href} key={item.slot}>{item.label}</a>
              : <Link href={item.href} key={item.slot}>{item.label}</Link>)}
          </nav>
        )}
        {/* 2026-09-23: хаалттай үед `inert`. ≤760px дээр drawer нь
            `max-height: 0; overflow: hidden`-ээр хумигддаг ч `display` нь
            `grid` хэвээр байдаг тул дотоод 15+ холбоос/товч харагдахгүй байж
            байгаад Tab-ийн дараалалд үлддэг: гадаад клавиатур/switch-access
            эсвэл дэлгэц уншигчтай хүн 0px өндөртэй "Арьс арчилгаа" дээр
            бууж, Enter дарахад хуудас сольдог. BackToTop (`tabIndex`) ба
            AddedToCartToast дээр аль хэдийн зассан ижил төрлийн алдаа. */}
        <div className={`commerce-mobile-menu ${menuOpen ? "open" : ""}`} inert={!menuOpen}>
          {/* 2026-09-07 (bsb.mn mobile-UX pass): now that BottomNavBar.tsx
              handles primary nav (Home/Shop/Cart/Wishlist/Profile) on every
              page, this drawer's own job shifts to what bsb.mn's real
              hamburger drawer does -- real category rows, then a short
              About/support section -- rather than repeating the same 2-3
              destinations the bottom bar already covers. Live-confirmed
              structure (full-screen drawer, category rows with a chevron,
              a divider, then secondary links); populated with SUGI's own
              real category list (categories-data.ts, the same single
              source of truth Home.tsx/Shop.tsx already use) and real
              legal/support pages, never bsb.mn's own categories. */}
          {/* Суулгах мөрийг ХАМГИЙН ДЭЭР (2026-09-16): товч зөвхөн footer-т
              байхад Tom утсан дээрээ олж чадаагүй — нүүр хуудасны хөл нь
              хэдэн дэлгэц доор байдаг. Суулгах боломжгүй хөтөч дээр болон
              суулгасны дараа компонент өөрөө юу ч зурдаггүй тул энд
              нөхцөлт шалгалт хэрэггүй. */}
          <InstallAppButton variant="row" onAction={closeMenu} />
          <NotificationOptIn variant="row" onAction={closeMenu} />
          <p className="commerce-mobile-menu-heading">{t("Ангилал")}</p>
          {categories.map(category => (
            <Link href={`/shop?category=${encodeURIComponent(category.name)}`} key={category.slug} onClick={closeMenu}>
              <span className="flex items-center gap-2"><category.Icon size={15} aria-hidden="true" />{category.name}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ))}
          <Link href="/shop" onClick={closeMenu}><span>{t("Бүх бүтээгдэхүүн")}</span><ArrowUpRight size={16} /></Link>
          {marketingNav && navItems.filter(item => item.href !== "/shop").map(item => item.anchor
            ? <a href={item.href} key={item.slot} onClick={closeMenu}><span>{item.label}</span><ArrowUpRight size={16} /></a>
            : <Link href={item.href} key={item.slot} onClick={closeMenu}><span>{item.label}</span><ArrowUpRight size={16} /></Link>)}
          {user && (
            <Link href="/profile?tab=wishlist" onClick={closeMenu}>
              <span>Хүслийн жагсаалт{wishlistCount > 0 ? ` (${wishlistCount})` : ""}</span><ArrowUpRight size={16} />
            </Link>
          )}
          <Link href="/profile" onClick={closeMenu}><span>{t("Профайл")}</span><ArrowUpRight size={16} /></Link>
          <p className="commerce-mobile-menu-heading">{t("Тухай")}</p>
          <Link href="/privacy" onClick={closeMenu}><span>{t("Нууцлалын бодлого")}</span><ArrowUpRight size={16} /></Link>
          <Link href="/terms" onClick={closeMenu}><span>{t("Үйлчилгээний нөхцөл")}</span><ArrowUpRight size={16} /></Link>
          <Link href="/returns" onClick={closeMenu}><span>{t("Буцаалт, солилцоо")}</span><ArrowUpRight size={16} /></Link>
        </div>
      </header>
      {selfManagedCart ? <CartDrawer open={ownCartOpen} onOpenChange={setOwnCartOpen} /> : null}
    </>
  );
}
