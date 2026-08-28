// PREMIUM-FEATURES.md TIER 3 Store Locator: hours/phone are the same across
// all 3 branches (confirmed with Tom, 2026-08-25) — daily 11:00-20:00, one
// shared central line (already the "залгах" button just above this list).
//
// Single source of truth for the 3 real branch records -- previously
// duplicated as constants inline in Home.tsx. Now shared by StoreLocatorSection
// (the branch list itself), TrustStrip (branch count), and WhyChooseUs (the
// "Ойрхон" card's branch count), so all three can never silently disagree
// about how many branches there are.
export const BRANCH_HOURS = "Өдөр бүр 11:00–20:00";
export const BRANCH_PHONE = "9450-9911";

export const locations = [
  { number: "01", name: "Орос элчингийн салбар", detail: "Chin Van Handdorj St, SBD - 4 khoroo, Ulaanbaatar 13120", mapUrl: "https://www.google.com/maps/search/?api=1&query=Chin+Van+Handdorj+St%2C+SBD+-+4+khoroo%2C+Ulaanbaatar+13120" },
  { number: "02", name: "Их наяд плаза", detail: "Ikh Mongol State Street 4, HUD - 15 khoroo, Ulaanbaatar 17009", mapUrl: "https://www.google.com/maps/search/?api=1&query=Ikh+Mongol+State+Street+4%2C+HUD+-+15+khoroo%2C+Ulaanbaatar+17009" },
  { number: "03", name: "Яармаг FOOD CITY", detail: "Naadamchid Rd, HUD - 24 khoroo, Ulaanbaatar 17080", mapUrl: "https://www.google.com/maps/search/?api=1&query=Naadamchid+Rd%2C+HUD+-+24+khoroo%2C+Ulaanbaatar+17080" },
];
