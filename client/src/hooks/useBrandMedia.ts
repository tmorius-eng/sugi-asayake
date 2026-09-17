import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { getSiteMediaSlot } from "@shared/site-media";

/**
 * The SUGI ASAYAKE wordmark and square symbol, as rendered by the header,
 * the footer, /careers and the admin rail (2026-09-17).
 *
 * Tom, direct ("end logo solidog ym algadaa bur ./admin deer!"): the logo was
 * a hard-coded /cdn/ path in three components, so a rebrand meant editing
 * code. It is now the `brand-logo` / `brand-symbol` media slot, uploaded in
 * /admin -> Content & Media like every other site image.
 *
 * Two sources, in this order, because the logo sits above the fold on every
 * page and must not visibly swap after load:
 *  1. the #brand-media JSON block, resolved server-side in indexHtml.ts and
 *     therefore correct in the very first paint (no request, no flash);
 *  2. the live content.siteMedia query, which takes over once it resolves --
 *     that is what makes an upload appear without waiting out index.html's
 *     60s render cache.
 * Both fall back to the slot's registered default, which is the exact file
 * these components used before this change.
 */
export type BrandMedia = { logo: string | null; symbol: string | null };

const slotDefault = (): BrandMedia => ({
  logo: getSiteMediaSlot("brand-logo").fallbackUrl,
  symbol: getSiteMediaSlot("brand-symbol").fallbackUrl,
});

/**
 * Read once at module load: the block is server-rendered into the document,
 * so it cannot change without a navigation. Anything unexpected (a dev server
 * serving the raw template, a stripped block) falls back to the registry
 * rather than throwing inside a render.
 */
const bootstrap: BrandMedia = (() => {
  const fallback = slotDefault();
  if (typeof document === "undefined") return fallback;
  try {
    const block = document.getElementById("brand-media");
    if (!block?.textContent) return fallback;
    const parsed = JSON.parse(block.textContent) as Partial<BrandMedia>;
    return {
      logo: typeof parsed.logo === "string" && parsed.logo ? parsed.logo : fallback.logo,
      symbol: typeof parsed.symbol === "string" && parsed.symbol ? parsed.symbol : fallback.symbol,
    };
  } catch {
    return fallback;
  }
})();

export function useBrandMedia(): BrandMedia {
  // Shared with useCategories/Home through react-query's cache, so this is
  // not an extra request on any page that already reads site media.
  const mediaQuery = trpc.content.siteMedia.useQuery();
  return useMemo(() => {
    const rows = mediaQuery.data;
    if (!rows) return bootstrap;
    const bySlot = new Map(rows.map(media => [media.slotKey, media.imageUrl]));
    return {
      logo: bySlot.get("brand-logo") || bootstrap.logo,
      // An empty symbol slot deliberately falls back to the wordmark: the
      // collapsed admin rail must show something, and a half-rebranded site
      // showing the OLD symbol next to a NEW logo would look broken.
      symbol: bySlot.get("brand-symbol") || bySlot.get("brand-logo") || bootstrap.symbol,
    };
  }, [mediaQuery.data]);
}
