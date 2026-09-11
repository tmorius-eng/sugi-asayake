import { BadgeCheck, CircleCheck, Flower2, Gift, LayoutGrid, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";

// 2026-09-12: this file used to BE the category list -- name, description,
// photo and order for all six, hardcoded. That made it the second source of
// truth next to the real `product_categories` table, and they had already
// drifted: /shop's filter pills read the database while the homepage, the
// header drawer and the footer read this array, so renaming a category in
// /admin changed one surface and left the other three showing the old name.
// The admin form's `description` and `imageUrl` fields were written to the
// database and then never read by anything at all.
//
// The list now comes from `trpc.content.categories` (server/db.ts's
// getPublishedCategories -- active categories that actually have published
// products). What stays here is the part a database column cannot hold: the
// Lucide icon component for each category, and the decorative `tone` class
// /shop's discovery cards use. Both are keyed by the real
// product_categories.slug, with a neutral default so a category added in
// /admin tomorrow renders correctly instead of crashing.
//
// See useCategories.ts for the hook that joins the two halves.

export type CategoryPresentation = { Icon: LucideIcon; tone: string };

const PRESENTATION_BY_SLUG: Record<string, CategoryPresentation> = {
  "arhis-archilgaa": { Icon: Flower2, tone: "rose" },
  "goo-saikhan": { Icon: Sparkles, tone: "cobalt" },
  "eruul-mend": { Icon: ShieldCheck, tone: "marigold" },
  "eruul-akhui": { Icon: BadgeCheck, tone: "mint" },
  "us-ba-bie": { Icon: CircleCheck, tone: "peach" },
  "eej-ba-khuukhed": { Icon: Gift, tone: "sand" },
};

/** Never throws for an unknown slug -- a brand-new category gets a neutral look. */
export const categoryPresentation = (slug: string): CategoryPresentation =>
  PRESENTATION_BY_SLUG[slug] ?? { Icon: LayoutGrid, tone: "sand" };
