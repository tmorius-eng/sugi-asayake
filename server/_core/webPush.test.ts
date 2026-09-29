import { describe, expect, it } from "vitest";
import { templateKeyForOrderStatus } from "./webPush";
import { orders } from "../../drizzle/schema";
import { storeSettingKeys } from "../../shared/store-settings";

/**
 * 2026-09-27 (C15): `orders.status` (drizzle/schema.ts) and the admin-editable
 * push template keys (shared/store-settings.ts) were never the same set of
 * names -- `templateKeyForOrderStatus` is the one place that bridges them.
 * This test walks the REAL enum values (not a hand-copied list, which is
 * exactly how the old code drifted out of sync with the schema) and checks
 * every non-null mapping actually has a title+body slot defined, so a future
 * schema change that adds a status without updating this map fails loudly
 * here instead of silently never pushing (the original bug).
 */
describe("templateKeyForOrderStatus", () => {
  const enumValues = orders.status.enumValues;

  it("orders.status has the statuses this test expects (catches schema drift)", () => {
    expect([...enumValues].sort()).toEqual(
      ["pending", "confirmed", "packed", "out_for_delivery", "completed", "cancelled", "returned"].sort(),
    );
  });

  it("every real order status maps to a template key with real title/body slots, or is explicitly skipped", () => {
    const knownSkips = new Set(["pending", "returned"]); // no push today -- see the function's own doc comment
    for (const status of enumValues) {
      const key = templateKeyForOrderStatus(status);
      if (key === null) {
        expect(knownSkips.has(status)).toBe(true);
        continue;
      }
      expect(storeSettingKeys).toContain(`push-title-order-${key}`);
      expect(storeSettingKeys).toContain(`push-body-order-${key}`);
    }
  });

  it("packed/completed pick the pickup-aware template when deliveryMethod is store_pickup", () => {
    expect(templateKeyForOrderStatus("packed", "store_pickup")).toBe("ready_for_pickup");
    expect(templateKeyForOrderStatus("packed", "delivery")).toBe("processing");
    expect(templateKeyForOrderStatus("packed", undefined)).toBe("processing");
    expect(templateKeyForOrderStatus("completed", "store_pickup")).toBe("completed");
    expect(templateKeyForOrderStatus("completed", "delivery")).toBe("delivered");
  });

  it("out_for_delivery/confirmed/cancelled map to their own templates regardless of delivery method", () => {
    expect(templateKeyForOrderStatus("out_for_delivery")).toBe("shipped");
    expect(templateKeyForOrderStatus("confirmed")).toBe("confirmed");
    expect(templateKeyForOrderStatus("cancelled")).toBe("cancelled");
  });
});
