/**
 * GA4 / Meta Pixel-д зориулсан худалдааны event-үүд (2026-09-14). Tag-ууд нь
 * /vendor/analytics-init.js-д байдаг бөгөөд зөвхөн күкийн зөвшөөрлийн дараа,
 * /admin-д ID тавигдсан үед л ачаалагдана; аль нь ч байхгүй бол энэ no-op тул
 * апп хэмжилт асаалттай эсэхийг мэдэх шаардлагагүй.
 */
type Item = { item_id: string; item_name: string; price: number; quantity: number };
type Params = { value?: number; currency?: string; transaction_id?: string; items?: Item[]; search_term?: string };

declare global { interface Window { sugiTrack?: (event: string, params?: Params) => void } }

export function trackEvent(event: "purchase" | "add_to_cart" | "view_item" | "begin_checkout" | "search", params: Params = {}): void {
  try { window.sugiTrack?.(event, { currency: "MNT", ...params }); } catch { /* measurement must never break the shop */ }
}
