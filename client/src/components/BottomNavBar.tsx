import { useState } from "react";
import { Heart, Home, LayoutGrid, LogIn, ShoppingBag, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import CartDrawer from "@/components/CartDrawer";
import { trpc } from "@/lib/trpc";

/**
 * 2026-09-07: bsb.mn-inspired persistent mobile bottom tab bar -- nothing
 * like this existed before (confirmed by an exhaustive grep for `fixed
 * bottom`/`bottom-0`/`sticky bottom` across client/src turning up zero
 * hits). Verified live on a real 390px mobile visit to bsb.mn itself (not
 * just from Tom's screenshots): a persistent bottom bar on every browsing
 * page, replaced -- not stacked -- by a single-purpose sticky bar on their
 * product page. ProductDetail.tsx's own sticky add-to-cart bar is that
 * replacement here; see the `hidden` check below.
 *
 * Self-contained by design (own cartOpen state, own CartDrawer instance,
 * own cart/wishlist queries) rather than lifting cart state into App.tsx --
 * every one of the 10 pages that already render CommerceHeader independently
 * owns this exact `cartOpen` + `<CartDrawer>` pattern today, so this copies
 * that established shape instead of refactoring all 10 for a feature that
 * doesn't require it. `trpc.cart.current` reuses the same query key React
 * Query already dedupes against whatever the current page's own identical
 * query is doing -- no extra network request.
 */
export default function BottomNavBar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [cartOpen, setCartOpen] = useState(false);
  const cartQuery = trpc.cart.current.useQuery();
  const wishlistQuery = trpc.profile.wishlist.list.useQuery(undefined, { enabled: Boolean(user) });
  const cartCount = cartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const wishlistCount = wishlistQuery.data?.length ?? 0;

  // ProductDetail.tsx renders its own sticky "quantity + Add to cart" bar
  // instead of this one -- bsb.mn itself never stacks two sticky bottom
  // bars on the same screen (confirmed live: their product page shows only
  // the add-to-cart bar, no tab bar; their category-listing pages show only
  // a page-specific Filter/Sort bar, also no tab bar).
  const hidden = location.startsWith("/product/") || location.startsWith("/admin");
  if (hidden) return null;

  return (
    <>
      <nav className="mobile-sticky-bar bottom-nav-bar" aria-label="Үндсэн цэс">
        <Link href="/" className={`bottom-nav-item${location === "/" ? " is-current" : ""}`}>
          <Home size={20} aria-hidden="true" /><span>Нүүр</span>
        </Link>
        <Link href="/shop" className={`bottom-nav-item${location.startsWith("/shop") ? " is-current" : ""}`}>
          <LayoutGrid size={20} aria-hidden="true" /><span>Ангилал</span>
        </Link>
        <button type="button" onClick={() => setCartOpen(true)} className="bottom-nav-item" aria-label={cartCount > 0 ? `Сагс нээх, ${cartCount} бараатай` : "Сагс нээх"}>
          <span className="bottom-nav-item-icon">
            <ShoppingBag size={20} aria-hidden="true" />
            {cartCount > 0 && <span className="bottom-nav-item-badge">{cartCount}</span>}
          </span>
          <span>Сагс</span>
        </button>
        <Link href="/profile?tab=wishlist" className={`bottom-nav-item${location.startsWith("/profile") && location.includes("wishlist") ? " is-current" : ""}`}>
          <span className="bottom-nav-item-icon">
            <Heart size={20} aria-hidden="true" />
            {wishlistCount > 0 && <span className="bottom-nav-item-badge">{wishlistCount}</span>}
          </span>
          <span>Хадгалсан</span>
        </Link>
        {/* Live-confirmed on bsb.mn's real mobile site: this 5th tab genuinely
            swaps both icon and label for a guest vs. a signed-in visitor
            (their own site shows "Нэвтрэх" on a real never-logged-in
            session) -- a deliberate improvement over CommerceHeader's
            desktop-era "always says Профайл, gate lives inside the page"
            pattern, not an inconsistency with it. */}
        {user ? (
          <Link href="/profile" className={`bottom-nav-item${location.startsWith("/profile") && !location.includes("wishlist") ? " is-current" : ""}`}>
            <User size={20} aria-hidden="true" /><span>Профайл</span>
          </Link>
        ) : (
          <Link href="/login" className={`bottom-nav-item${location === "/login" ? " is-current" : ""}`}>
            <LogIn size={20} aria-hidden="true" /><span>Нэвтрэх</span>
          </Link>
        )}
      </nav>
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
