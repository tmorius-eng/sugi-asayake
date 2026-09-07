// 2026-09-07 (Tom, bsb.mn reference, explicit): a plain custom-event dispatch
// rather than a context provider or prop-drilled callback -- every add-to-cart
// entry point on the site (ProductDetail's main button and its mobile sticky
// bar, QuickViewDialog, RoutineCrossSell, Profile's "buy again", BottomNavBar's
// own cart flow) lives in a different file/component tree with no shared
// ancestor closer than App.tsx, and this project's own established pattern
// for exactly that shape of problem (SitePromo, BottomNavBar) is a single
// always-mounted listener rather than threading a callback through every
// layer. See AddedToCartToast.tsx (mounted once in App.tsx) for the listener.
export const ADDED_TO_CART_EVENT = "sugi:added-to-cart";

export function notifyAddedToCart(message: string) {
  window.dispatchEvent(new CustomEvent<{ message: string }>(ADDED_TO_CART_EVENT, { detail: { message } }));
}
