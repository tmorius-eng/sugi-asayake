/**
 * Commerce events for GA4 / Meta Pixel (2026-09-14). The tags themselves
 * live in /vendor/analytics-init.js and load only after cookie consent and
 * only when an id is set in /admin; without either this is a no-op, so the
 * app never has to know whether measurement is on.
 */
type Item = { item_id: string; item_name: string; price: number; quantity: number };
type Params = { value?: number; currency?: string; transaction_id?: string; items?: Item[]; search_term?: string };

declare global { interface Window { sugiTrack?: (event: string, params?: Params) => void } }

export function trackEvent(event: "purchase" | "add_to_cart" | "view_item" | "begin_checkout" | "search", params: Params = {}): void {
  try { window.sugiTrack?.(event, { currency: "MNT", ...params }); } catch { /* measurement must never break the shop */ }
}
