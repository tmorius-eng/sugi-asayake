import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { NOT_ADMIN_ERR_MSG } from "../shared/const";

function createContext(role: "user" | "admin" | null): TrpcContext {
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
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("commerce router", () => {
  it("keeps the public catalog query available before products are entered", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.catalog.list()).resolves.toEqual([]);
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

  it("does not expose Content & Media administration or uploads to a standard user", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.admin.siteMedia()).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.updateSiteMedia({ slotKey: "home-hero", imageUrl: "/manus-storage/test.jpg", altText: "Test" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.uploadSiteMediaImage({ fileName: "test.png", contentType: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
  });

  it("does not expose staff invitations or role changes to a standard user", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.admin.inviteStaff({ email: "staff@example.com", role: "user", origin: "https://sugi.example" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.updateUserRole({ userId: 2, role: "admin" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
  });

  it("does not expose order fulfilment or editorial publishing to a standard user", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.admin.orders()).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.updateOrder({ id: 1, status: "confirmed" })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
    await expect(caller.admin.createPost({ title: "New Japanese care", slug: "new-japanese-care", content: "A sufficiently long post body for authorization testing.", isPublished: false })).rejects.toMatchObject({ message: NOT_ADMIN_ERR_MSG, code: "FORBIDDEN" });
  });

  it("requires authentication before reading a persistent customer cart", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.cart.current()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires authentication before a customer can create a QPay invoice", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.payments.qpayCreateInvoice({ orderId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires authentication for customer order history and checkout order creation", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.orders.mine()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.checkout.createOrder({
      customerName: "Checkout Test",
      customerPhone: "99112233",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
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

  it("requires authentication before an invitation token can be accepted", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.invites.accept({ token: "a".repeat(43) })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
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
