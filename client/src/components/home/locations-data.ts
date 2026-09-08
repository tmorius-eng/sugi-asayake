// PREMIUM-FEATURES.md TIER 3 Store Locator: hours are the same across all
// branches (confirmed with Tom, 2026-08-25) -- daily 11:00-20:00.
//
// "Controls everything" admin overhaul (2026-09-08, Phase J): the real
// branch records (name/address/phone/mapUrl) that used to live here as a
// hardcoded `locations` array now live in the `branches` table, read live
// via `trpc.content.branches.useQuery()` (StoreLocatorSection/SiteFooter/
// Checkout's pickup-branch picker all read it) -- an admin can add/edit/
// deactivate a branch without a deploy now, and it fixed a real bug as a
// side effect: branch 04 existed in the old array but wasn't in checkout's
// separate, stale 3-branch enum, so it was never actually selectable.
//
// BRANCH_HOURS stays here as a code constant rather than a `branches`
// column: it's one shared operating-hours fact across every branch, not a
// per-branch field, so a `branches` table column would just duplicate the
// same string 4 times for no benefit.
export const BRANCH_HOURS = "Өдөр бүр 11:00–20:00";
