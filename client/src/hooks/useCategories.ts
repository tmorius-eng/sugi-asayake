import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/hooks/useLocale";
import { translate } from "@shared/i18n";
import { categoryPresentation } from "@/components/home/categories-data";
import { getCategoryPlaceholderImage } from "@shared/catalog-filter";
import { getSiteMediaSlot, siteMediaSlotKeys } from "@shared/site-media";

export type StorefrontCategory = {
  id: number;
  name: string;
  slug: string;
  /** The admin's category description; the card's second line. */
  detail: string;
  imageUrl: string;
  productCount: number;
  Icon: ReturnType<typeof categoryPresentation>["Icon"];
  tone: string;
};

/**
 * The one list of catalogue categories the storefront renders (2026-09-12).
 *
 * Joins three admin-owned sources so every surface (homepage mosaic,
 * header drawer, footer column, /shop discovery cards) agrees:
 *  - name / description / order / which categories exist -> product_categories
 *    (/admin -> Бүтээгдэхүүн -> Ангилал)
 *  - the card photo -> the `home-category-<slug>` image slot
 *    (/admin -> Content & Media), then the category's own imageUrl field
 *  - the icon and decorative tone -> categories-data.ts (not data a column
 *    can hold)
 *
 * Photo precedence is deliberate: an admin-uploaded slot wins, then the
 * admin's own category imageUrl, then this codebase's per-slot default
 * photo, then the generic placeholder. Admin-set values always beat code
 * defaults; a code default always beats an empty frame.
 *
 * Both queries are shared with the rest of the page by react-query's cache,
 * so calling this hook in four components costs two requests, not eight.
 */
export function useCategories(): StorefrontCategory[] {
  const categoriesQuery = trpc.content.categories.useQuery();
  const mediaQuery = trpc.content.siteMedia.useQuery();
  // The six catalogue categories are shop vocabulary rather than product
  // data, so they are in the dictionary and follow the chosen language; the
  // slug (and therefore every /shop?category= link) is untouched.
  const locale = useLocale();

  return useMemo(() => {
    const mediaBySlot = new Map((mediaQuery.data ?? []).map(media => [media.slotKey, media.imageUrl]));
    // The media registry is a fixed enum, so a category added in /admin has
    // no slot of its own -- checked rather than assumed, to avoid calling
    // getSiteMediaSlot with a key it doesn't know.
    const knownSlots = new Set<string>(siteMediaSlotKeys);

    return (categoriesQuery.data ?? []).map(category => {
      const slotKey = `home-category-${category.slug}`;
      const slotDefault = knownSlots.has(slotKey)
        ? getSiteMediaSlot(slotKey as (typeof siteMediaSlotKeys)[number]).fallbackUrl
        : null;
      const { Icon, tone } = categoryPresentation(category.slug);
      return {
        id: category.id,
        name: translate(category.name, locale),
        slug: category.slug,
        detail: category.description ?? "",
        imageUrl: mediaBySlot.get(slotKey) || category.imageUrl || slotDefault || getCategoryPlaceholderImage(category.slug),
        productCount: category.productCount,
        Icon,
        tone,
      };
    });
  }, [categoriesQuery.data, mediaQuery.data, locale]);
}
