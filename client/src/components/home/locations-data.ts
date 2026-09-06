// PREMIUM-FEATURES.md TIER 3 Store Locator: hours are the same across all
// branches (confirmed with Tom, 2026-08-25) — daily 11:00-20:00.
//
// Single source of truth for the real branch records -- previously
// duplicated as constants inline in Home.tsx. Now shared by StoreLocatorSection
// (the branch list itself) and BrandStorySection (the "Ойрхон" card's
// branch count), so all of them can never silently disagree about how many
// branches there are.
export const BRANCH_HOURS = "Өдөр бүр 11:00–20:00";
// The first 3 branches share one central line; branch 04 (2026-09-01, Tom)
// has its own distinct number -- see `phone` per-branch below instead of a
// single shared constant. Kept only as the top-level "залгах" CTA's number
// (the general contact line, not tied to any one branch).
export const BRANCH_PHONE = "9450-9911";

export const locations = [
  { number: "01", name: "Орос элчингийн салбар", detail: "Chin Van Handdorj St, SBD - 4 khoroo, Ulaanbaatar 13120", phone: "9450-9911", mapUrl: "https://www.google.com/maps/search/?api=1&query=Chin+Van+Handdorj+St%2C+SBD+-+4+khoroo%2C+Ulaanbaatar+13120" },
  { number: "02", name: "Их наяд плаза", detail: "Ikh Mongol State Street 4, HUD - 15 khoroo, Ulaanbaatar 17009", phone: "9450-9911", mapUrl: "https://www.google.com/maps/search/?api=1&query=Ikh+Mongol+State+Street+4%2C+HUD+-+15+khoroo%2C+Ulaanbaatar+17009" },
  { number: "03", name: "Яармаг FOOD CITY", detail: "Naadamchid Rd, HUD - 24 khoroo, Ulaanbaatar 17080", phone: "9450-9911", mapUrl: "https://www.google.com/maps/search/?api=1&query=Naadamchid+Rd%2C+HUD+-+24+khoroo%2C+Ulaanbaatar+17080" },
  // Added 2026-09-01 (Tom). Real business data, not a placeholder -- own
  // distinct phone line, matches the exact address given.
  { number: "04", name: "Japan Town C6, Four Seasons Garden Center 3 давхар", detail: "Hurd Horoololiin Zam 26, HUD - 18 khoroo, Ulaanbaatar 17013", phone: "9565-1578", mapUrl: "https://www.google.com/maps/search/?api=1&query=Hurd+Horoololiin+Zam+26%2C+HUD+-+18+khoroo%2C+Ulaanbaatar+17013" },
];
