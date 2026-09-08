import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { NOT_ADMIN_ERR_MSG } from "../shared/const";

// Admin overhaul (2026-09-08, Phase B): the single highest-priority test in
// that whole effort. Widening staffProcedure's old "anyone but a plain user"
// scope into 5 real departments (staff/finance/marketing/warehouse/admin)
// touched ~50 router entries in one pass — a role-boundary mistake here is a
// security regression (a department seeing/doing something it shouldn't),
// not a cosmetic one, so this sweeps every new middleware type
// (anyStaffProcedure/catalogReadProcedure/contentReadProcedure/
// warehouseProcedure/marketingProcedure/financeProcedure) across all 6 role
// values against a representative endpoint sample, rather than trusting a
// handful of ad-hoc spot checks. See server/commerce.router.test.ts for the
// pre-existing, narrower staff-vs-admin checks this complements (several of
// those were updated in the same commit to stop asserting the now-stale
// "staff can do everything but user/role management" boundary).
//
// No RUN_AUTH_INTEGRATION_TESTS gate, matching commerce.router.test.ts's own
// choice: this only exercises the role-check middleware (which runs before
// any DB read/write), so it doesn't need throwaway fixture rows — every case
// below is either an "expect FORBIDDEN" (never touches the DB at all, the
// middleware throws first) or an "expect it clears the gate" read against
// whatever real rows already exist in the shared dev DB, the same
// DB-content-independent pattern commerce.router.test.ts already uses.

type Role = "user" | "staff" | "finance" | "marketing" | "warehouse" | "admin";
const ALL_ROLES: Role[] = ["user", "staff", "finance", "marketing", "warehouse", "admin"];

function callerFor(role: Role): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user: {
      id: 1,
      email: "rbac-test@example.invalid",
      name: "RBAC Test User",
      role,
      emailVerifiedAt: null,
      sessionVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {}, ip: `192.0.2.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "192.0.2.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

type Case = {
  name: string;
  allowed: Role[];
  call: (caller: ReturnType<typeof appRouter.createCaller>) => Promise<unknown>;
  // Most cases here are read-only queries that resolve unconditionally once
  // the role gate opens. A few (updateOrder/refundOrder) are mutations
  // targeting a deliberately nonexistent id (999999) so this suite never
  // needs its own real order fixture -- those legitimately REJECT for an
  // allowed role too (a "not found"-style BAD_REQUEST from inside the
  // resolver), which is fine: the point under test is that the FORBIDDEN
  // gate isn't what stopped them, same pattern commerce.router.test.ts's
  // "strips a staff-submitted costMnt" case already established.
  allowedAssertion?: "resolves" | "rejects-not-forbidden";
};

const cases: Case[] = [
  // anyStaffProcedure — the shared dashboard shell every department lands on.
  { name: "dashboardSummary (anyStaffProcedure)", allowed: ["staff", "finance", "marketing", "warehouse", "admin"], call: c => c.admin.dashboardSummary() },
  { name: "systemHealth (anyStaffProcedure)", allowed: ["staff", "finance", "marketing", "warehouse", "admin"], call: c => c.admin.systemHealth() },
  { name: "search (anyStaffProcedure)", allowed: ["staff", "finance", "marketing", "warehouse", "admin"], call: c => c.admin.search({ query: "test" }) },

  // catalogReadProcedure — shared read between warehouse (owns it) and
  // marketing (Routines composer's product picker, category tiles).
  { name: "products read (catalogReadProcedure)", allowed: ["warehouse", "marketing", "admin"], call: c => c.admin.products() },
  { name: "categories read (catalogReadProcedure)", allowed: ["warehouse", "marketing", "admin"], call: c => c.admin.categories() },

  // contentReadProcedure — shared read between staff (owns posts) and
  // marketing (Content Calendar reads both posts and promotions).
  { name: "posts read (contentReadProcedure)", allowed: ["staff", "marketing", "admin"], call: c => c.admin.posts() },
  { name: "promotions read (contentReadProcedure)", allowed: ["staff", "marketing", "admin"], call: c => c.admin.promotions() },

  // warehouseProcedure — fulfilment/stock-keeping, not staff's remaining
  // scope and not a money decision (that's financeProcedure's refund action,
  // Phase E).
  { name: "productVariants read (warehouseProcedure)", allowed: ["warehouse", "admin"], call: c => c.admin.productVariants({ productId: 1 }) },
  // Phase M: the POS tool -- same warehouseProcedure weight as the stock
  // endpoints above.
  { name: "posSearchVariants (warehouseProcedure)", allowed: ["warehouse", "admin"], call: c => c.admin.posSearchVariants({ branchId: 999999, search: "" }) },
  { name: "recordInStoreSale (warehouseProcedure)", allowed: ["warehouse", "admin"], allowedAssertion: "rejects-not-forbidden", call: c => c.admin.recordInStoreSale({ branchId: 999999, items: [{ variantId: 999999, quantity: 1 }] }) },

  // ordersReadProcedure (Phase E) — shared read between warehouse (owns
  // fulfillment) and finance (needs to find a returned-but-unrefunded order
  // before calling admin.refundOrder on it). Writes (updateOrder/
  // bulkUpdateOrderStatus) stay warehouseProcedure-only, covered separately
  // below.
  { name: "orders read (ordersReadProcedure)", allowed: ["warehouse", "finance", "admin"], call: c => c.admin.orders() },
  { name: "updateOrder write (warehouseProcedure, not finance)", allowed: ["warehouse", "admin"], allowedAssertion: "rejects-not-forbidden", call: c => c.admin.updateOrder({ id: 999999, adminNote: "rbac sweep" }) },

  // financeProcedure's refund authority (Phase E) -- deliberately separate
  // from warehouseProcedure above, since recording a refund is a money
  // decision, not a fulfilment one.
  { name: "refundOrder (financeProcedure)", allowed: ["finance", "admin"], allowedAssertion: "rejects-not-forbidden", call: c => c.admin.refundOrder({ id: 999999, refundAmountMnt: 0, restockItems: false }) },

  // marketingProcedure — customer-facing content/merchandising levers.
  { name: "reviews read (marketingProcedure)", allowed: ["marketing", "admin"], call: c => c.admin.reviews() },
  { name: "routines read (marketingProcedure)", allowed: ["marketing", "admin"], call: c => c.admin.routines() },
  { name: "discountCodes read (marketingProcedure)", allowed: ["marketing", "admin"], call: c => c.admin.discountCodes() },
  { name: "featuredBrands read (marketingProcedure)", allowed: ["marketing", "admin"], call: c => c.admin.featuredBrands() },
  // Phase J: same weight/shape as featuredBrands above.
  { name: "branches read (marketingProcedure)", allowed: ["marketing", "admin"], call: c => c.admin.branches() },
  { name: "siteMedia read (marketingProcedure)", allowed: ["marketing", "admin"], call: c => c.admin.siteMedia() },
  { name: "siteText read (marketingProcedure)", allowed: ["marketing", "admin"], call: c => c.admin.siteText() },

  // financeProcedure — money/analytics, plus refund authority (Phase E) and
  // store-credit authority (Phase H).
  { name: "analyticsReport (financeProcedure)", allowed: ["finance", "admin"], call: c => c.admin.analyticsReport({}) },
  { name: "marketingSpend (financeProcedure)", allowed: ["finance", "admin"], call: c => c.admin.marketingSpend({ monthKeys: ["2026-09"] }) },
  { name: "storeCreditLedger (financeProcedure)", allowed: ["finance", "admin"], call: c => c.admin.storeCreditLedger({ userId: 999999 }) },
  { name: "adjustStoreCredit (financeProcedure)", allowed: ["finance", "admin"], allowedAssertion: "rejects-not-forbidden", call: c => c.admin.adjustStoreCredit({ userId: 999999, deltaMnt: 1000, reason: "rbac test" }) },

  // "Controls everything" admin overhaul (2026-09-08, Phase H): the shared
  // users-read exception -- finance needs to find a customer before it can
  // call adjustStoreCredit on them (same shape as ordersReadProcedure).
  { name: "users read (usersReadProcedure)", allowed: ["finance", "admin"], call: c => c.admin.users() },
  { name: "userDetail (usersReadProcedure)", allowed: ["finance", "admin"], allowedAssertion: "rejects-not-forbidden", call: c => c.admin.userDetail({ userId: 999999 }) },

  // adminProcedure, unchanged by this overhaul — confirms none of the 4 NEW
  // roles accidentally inherited any admin-only access (the thing a copy-
  // paste mistake across ~50 reassignments would most plausibly produce).
  { name: "integrations (adminProcedure, unchanged)", allowed: ["admin"], call: c => c.admin.integrations() },
  { name: "auditLogs (adminProcedure, unchanged)", allowed: ["admin"], call: c => c.admin.auditLogs({}) },
  { name: "loginHistory (adminProcedure, unchanged)", allowed: ["admin"], call: c => c.admin.loginHistory({ outcome: "all" }) },
  { name: "honeybadgerFaults (adminProcedure, unchanged)", allowed: ["admin"], call: c => c.admin.honeybadgerFaults() },
];

describe("RBAC boundaries across all 6 roles (Admin overhaul Phase B)", () => {
  for (const testCase of cases) {
    for (const role of ALL_ROLES) {
      const shouldAllow = testCase.allowed.includes(role);
      it(`${testCase.name}: ${role} is ${shouldAllow ? "allowed" : "forbidden"}`, async () => {
        const caller = callerFor(role);
        if (shouldAllow) {
          if (testCase.allowedAssertion === "rejects-not-forbidden") {
            // A mutation against a deliberately nonexistent id (999999) —
            // legitimately rejects with a "not found"-style BAD_REQUEST even
            // for an allowed role; the point is that FORBIDDEN isn't what
            // stopped it.
            await expect(testCase.call(caller)).rejects.not.toMatchObject({ message: NOT_ADMIN_ERR_MSG });
          } else {
            // Proves the gate actually opens (resolves), not just "didn't
            // throw FORBIDDEN" — every other case here is a read against
            // whatever real rows already exist, so a genuine resolve is the
            // right bar.
            await expect(testCase.call(caller)).resolves.not.toBeUndefined();
          }
        } else {
          await expect(testCase.call(caller)).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
        }
      });
    }
  }
});
