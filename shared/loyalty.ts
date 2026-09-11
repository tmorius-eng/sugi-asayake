// PREMIUM-FEATURES.md TIER 5: matches the real cumulative-lifetime-spend
// discount tiers already configured on Tom's Smart POS system across all 3
// physical branches (confirmed 2026-08-25) — 500k -> 3%, 1M -> 5%, 10M -> 10%.
// This is the single source of truth for the tier table; both the server
// (enforcement + admin display) and the client (profile card, checkout
// preview) import from here so they can never drift apart.
export type LoyaltyTier = { name: string; discountPercent: number; minSpendMnt: number };

export const LOYALTY_TIERS: LoyaltyTier[] = [
  { name: "Стандарт", discountPercent: 0, minSpendMnt: 0 },
  { name: "Хүрэл", discountPercent: 3, minSpendMnt: 500_000 },
  { name: "Мөнгөн", discountPercent: 5, minSpendMnt: 1_000_000 },
  { name: "Алтан", discountPercent: 10, minSpendMnt: 10_000_000 },
];

// 2026-09-12: the ladder moved into the `loyalty_tiers` table so the owner
// can change it from /admin (server/db.ts's getLoyaltyTierTable). Both
// helpers now take the tier list as an optional argument; omitting it keeps
// the previous behaviour exactly, which is what every caller that cannot
// await a DB read (and the fallback path itself) still relies on.
//
// The list is assumed ascending by minSpendMnt -- getLoyaltyTierTable
// orders it that way, and the constant below is written that way.
export function getLoyaltyTier(totalSpendMnt: number, tiers: LoyaltyTier[] = LOYALTY_TIERS): LoyaltyTier {
  let current = tiers[0];
  for (const tier of tiers) {
    if (totalSpendMnt >= tier.minSpendMnt) current = tier;
  }
  return current;
}

export function getNextLoyaltyTier(totalSpendMnt: number, tiers: LoyaltyTier[] = LOYALTY_TIERS): LoyaltyTier | null {
  const currentIndex = tiers.indexOf(getLoyaltyTier(totalSpendMnt, tiers));
  return tiers[currentIndex + 1] ?? null;
}
