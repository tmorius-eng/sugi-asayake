import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../shared/const";

function createContext(role: "user" | "staff" | "admin" | null): TrpcContext {
  const user = role ? {
    id: 1,
    email: "test@example.com",
    name: "Commerce Test User",
    role,
    emailVerifiedAt: null,
    sessionVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } : null;

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
      ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
      socket: { remoteAddress: "198.51.100.1" },
    } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("commerce router", () => {
  it("keeps the public catalog query available to anonymous visitors", async () => {
    // Intentionally does not assert on the catalog's *contents* — this suite
    // runs against a real, shared MySQL database when the DB-gated
    // integration suites are also enabled, and other integration tests
    // legitimately insert/delete their own products concurrently. Asserting
    // "the catalog is empty" here was really testing an incidental snapshot
    // of unrelated global state, not what this test claims to test (that the
    // endpoint is public and doesn't throw) — it should and does hold
    // regardless of what's actually in the catalog at the time.
    const caller = appRouter.createCaller(createContext(null));
    // Frontend performance audit (2026-09-02): catalog.list now returns a
    // paginated { items, totalCount, totalPublishedCount, categories,
    // skinTypes } shape instead of a bare array -- see getPublishedCatalogPage
    // in server/db.ts.
    const catalog = await caller.catalog.list();
    expect(Array.isArray(catalog.items)).toBe(true);
  });

  it("returns null rather than undefined when a public product slug is absent", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.catalog.bySlug({ slug: "missing-product-regression-check" })).resolves.toBeNull();
  });

  it("does not expose admin product management to a standard user", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.admin.products()).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
  });

  it("does not expose product writes or image uploads to a standard user", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.admin.createProduct({ categoryId: 1, name: "Test product", slug: "test-product", priceMnt: 1000, sku: "TEST-001", stockQuantity: 1, isPublished: false })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.uploadProductImage({ fileName: "test.png", contentType: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
  });

  // PREMIUM-FEATURES.md TIER 2: reviews & ratings auth gating.
  it("keeps the public reviews list available to anonymous visitors", async () => {
    const caller = appRouter.createCaller(createContext(null));
    const reviews = await caller.reviews.list({ productId: 1 });
    expect(Array.isArray(reviews)).toBe(true);
  });

  it("requires login to check review eligibility or submit a review", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.reviews.eligibility({ productId: 1 })).rejects.toMatchObject({ message: UNAUTHED_ERR_MSG, code: "UNAUTHORIZED" });
    await expect(caller.reviews.create({ productId: 1, rating: 5, comment: null })).rejects.toMatchObject({ message: UNAUTHED_ERR_MSG, code: "UNAUTHORIZED" });
  });

  it("rejects an out-of-range rating before it ever reaches the verified-purchase check", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.reviews.create({ productId: 1, rating: 6, comment: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.reviews.create({ productId: 1, rating: 0, comment: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("does not expose review moderation to a standard user", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.admin.reviews()).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.updateReviewApproval({ id: 1, isApproved: false })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.deleteReview({ id: 1 })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
  });

  it("lets staff (not just admin) moderate reviews", async () => {
    const caller = appRouter.createCaller(createContext("staff"));
    // No DB in this suite by default (see catalog.list comment above) — this
    // only asserts staff clears the role gate, not that a row exists.
    await expect(caller.admin.reviews()).resolves.toBeInstanceOf(Array);
  });

  it("does not expose Content & Media administration or uploads to a standard user", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.admin.siteMedia()).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.updateSiteMedia({ slotKey: "home-hero", imageUrl: "/cdn/test.jpg", altText: "Test" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.uploadSiteMediaImage({ fileName: "test.png", contentType: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
  });

  it("requires a session for every profile procedure (name/phone, avatar, address book)", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.profile.update({ name: "Nope" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.uploadAvatar({ fileName: "me.png", contentType: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.removeAvatar()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.addresses.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.addresses.create({ label: "Гэр", recipientName: "Test", phone: "99001122", addressLine: "Test address line" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.addresses.update({ id: 1, label: "Nope" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.addresses.delete({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.updatePreferences({ skinType: "normal" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.updateNotifications({ emailOptIn: false })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.changePassword({ currentPassword: "x", newPassword: "BrandNewPassw0rd!" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.deleteAccount({ password: "x" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.wishlist.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.wishlist.toggle({ productId: 1, saved: true })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks a signed-in but non-'user'-role account from self-deleting via profile.deleteAccount", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.profile.deleteAccount({ password: "whatever" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a malformed delivery phone number on the profile and address book the same way checkout does", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.profile.update({ phone: "abc" })).rejects.toThrow();
    await expect(caller.profile.addresses.create({ label: "Гэр", recipientName: "Test", phone: "abc", addressLine: "Test address line" })).rejects.toThrow();
  });

  it("does not expose role changes or the phone-recovery tool to a standard user", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.admin.updateUserRole({ userId: 2, role: "admin" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.updateUserPhone({ userId: 2, phone: "99001122" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
  });

  it("does not expose order fulfilment or editorial publishing to a standard user", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.admin.orders()).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.updateOrder({ id: 1, status: "confirmed" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.createPost({ title: "New Japanese care", slug: "new-japanese-care", content: "A sufficiently long post body for authorization testing.", isPublished: false })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
  });

  it("does not expose bulk product/order status changes to a standard user, but does allow staff (TIER 5)", async () => {
    const userCaller = appRouter.createCaller(createContext("user"));
    await expect(userCaller.admin.bulkUpdateProductPublishStatus({ ids: [1], isPublished: true })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(userCaller.admin.bulkUpdateOrderStatus({ ids: [1], status: "confirmed" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });

    // Staff is allowed through the gate — without a DB, updateAdminProduct/
    // updateAdminOrder resolve to undefined/throw "not found" per id, which
    // the bulk handler reports as a failed id rather than a FORBIDDEN
    // rejection. That's the behavior under test here: the RBAC gate opens
    // for staff; server/admin.bulk-actions.integration.test.ts covers the
    // actual partial-success bookkeeping against a real DB.
    const staffCaller = appRouter.createCaller(createContext("staff"));
    await expect(staffCaller.admin.bulkUpdateProductPublishStatus({ ids: [999999], isPublished: true })).resolves.toMatchObject({ succeeded: [], failed: [{ id: 999999 }] });
    await expect(staffCaller.admin.bulkUpdateOrderStatus({ ids: [999999], status: "confirmed" })).resolves.toMatchObject({ succeeded: [], failed: [{ id: 999999 }] });
  });

  it("gives an anonymous shopper an empty cart instead of requiring an account (guest checkout)", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.cart.current()).resolves.toBeNull();
  });

  it("requires authentication before a customer can create a QPay invoice", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.payments.qpayCreateInvoice({ orderId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires authentication for customer order history", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.orders.mine()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows an anonymous shopper to attempt checkout (guest checkout), rejecting only because the cart is empty", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.checkout.createOrder({
      customerName: "Guest Checkout Test",
      customerPhone: "99112233",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a store-pickup checkout when no SUGI branch is selected", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.checkout.createOrder({
      customerName: "Checkout Test",
      customerPhone: "99112233",
      deliveryMethod: "store_pickup",
      pickupBranch: "",
      paymentMethod: "cash_on_delivery",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lets staff manage products, orders, posts, and media, but not user accounts, roles, or the phone-recovery tool (TIER 3)", async () => {
    const caller = appRouter.createCaller(createContext("staff"));

    // Storefront operations: allowed — resolves to an array (empty without a
    // DB, real rows when this suite runs against the shared dev DB
    // alongside the other integration suites — see the "keeps the public
    // catalog query available" test above for why this doesn't assert on
    // contents), rather than a FORBIDDEN rejection.
    await expect(caller.admin.products()).resolves.toSatisfy(Array.isArray);
    await expect(caller.admin.orders()).resolves.toSatisfy(Array.isArray);
    await expect(caller.admin.posts()).resolves.toSatisfy(Array.isArray);
    await expect(caller.admin.siteMedia()).resolves.toSatisfy(Array.isArray);

    // User/role management: still admin-only.
    await expect(caller.admin.users()).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.updateUserRole({ userId: 2, role: "admin" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.updateUserPhone({ userId: 2, phone: "99001122" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.suspendUser({ userId: 2 })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.forceLogoutUser({ userId: 2 })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
  });

  it("keeps the audit log and login history admin-only, off limits to staff (TIER 4)", async () => {
    const staffCaller = appRouter.createCaller(createContext("staff"));
    await expect(staffCaller.admin.auditLogs({})).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(staffCaller.admin.loginHistory({ outcome: "all" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });

    const adminCaller = appRouter.createCaller(createContext("admin"));
    await expect(adminCaller.admin.auditLogs({})).resolves.toSatisfy(Array.isArray);
    await expect(adminCaller.admin.loginHistory({ outcome: "all" })).resolves.toSatisfy(Array.isArray);
  });

  it("exposes the basic DB/storage health widget to staff, but not to a standard user (TIER 6)", async () => {
    const userCaller = appRouter.createCaller(createContext("user"));
    await expect(userCaller.admin.systemHealth()).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });

    const staffCaller = appRouter.createCaller(createContext("staff"));
    const health = await staffCaller.admin.systemHealth();
    expect(health).toMatchObject({ db: { ok: expect.any(Boolean) }, storage: { ok: expect.any(Boolean) } });
  });

  it("redacts revenue/active-user figures and user search hits from staff, but not from a full admin", async () => {
    const staffCaller = appRouter.createCaller(createContext("staff"));
    const staffSummary = await staffCaller.admin.dashboardSummary();
    expect(staffSummary.totalRevenueMnt).toBeNull();
    expect(staffSummary.activeUsers).toBeNull();
    const staffSearch = await staffCaller.admin.search({ query: "test" });
    expect(staffSearch.users).toEqual([]);

    const adminCaller = appRouter.createCaller(createContext("admin"));
    const adminSummary = await adminCaller.admin.dashboardSummary();
    expect(adminSummary.totalRevenueMnt).not.toBeNull();
    expect(adminSummary.activeUsers).not.toBeNull();
  });

  it("does not let an administrator remove their own role from the admin workflow", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.updateUserRole({ userId: 1, role: "user" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("reports that QPay is unavailable until merchant credentials are configured", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.payments.qpayCreateInvoice({ orderId: 1 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
