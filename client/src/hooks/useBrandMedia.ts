import { useMemo } from "react";
import { useSiteMedia } from "@/hooks/useSiteMedia";
import { getSiteMediaSlot } from "@shared/site-media";

export type BrandMedia = { logo: string | null; symbol: string | null };

/**
 * The header wordmark and the collapsed-rail symbol, from the brand-logo /
 * brand-symbol media slots -- admin upload first, else the registered default.
 *
 * 2026-09-17: bootstrapped from a logo-only `#brand-media` block so the very
 * first paint carried the uploaded logo. 2026-09-21: that block became
 * `#site-media` (every slot, hydrating the query cache in useSiteMedia.ts) so
 * the hero could stop waiting on tRPC too; the first-paint guarantee for the
 * logo is unchanged, just served through the cache instead of a side channel.
 */
const slotDefault = (): BrandMedia => ({
  logo: getSiteMediaSlot("brand-logo").fallbackUrl,
  symbol: getSiteMediaSlot("brand-symbol").fallbackUrl,
});

export function useBrandMedia(): BrandMedia {
  // Shared with useCategories/Home through react-query's cache, so this is
  // not an extra request on any page that already reads site media.
  const mediaQuery = useSiteMedia();
  return useMemo(() => {
    const fallback = slotDefault();
    const rows = mediaQuery.data;
    if (!rows) return fallback;
    const bySlot = new Map(rows.map(media => [media.slotKey, media.imageUrl]));
    return {
      logo: bySlot.get("brand-logo") || fallback.logo,
      // An empty symbol slot deliberately falls back to the wordmark: the
      // collapsed admin rail must show something, and a half-rebranded site
      // showing the OLD symbol next to a NEW logo would look broken.
      symbol: bySlot.get("brand-symbol") || bySlot.get("brand-logo") || fallback.symbol,
    };
  }, [mediaQuery.data]);
}
