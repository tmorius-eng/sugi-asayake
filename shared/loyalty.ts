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

export function getLoyaltyTier(totalSpendMnt: number): LoyaltyTier {
  let current = LOYALTY_TIERS[0];
  for (const tier of LOYALTY_TIERS) {
    if (totalSpendMnt >= tier.minSpendMnt) current = tier;
  }
  return current;
}

export function getNextLoyaltyTier(totalSpendMnt: number): LoyaltyTier | null {
  const currentIndex = LOYALTY_TIERS.indexOf(getLoyaltyTier(totalSpendMnt));
  return LOYALTY_TIERS[currentIndex + 1] ?? null;
}
