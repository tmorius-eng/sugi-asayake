import { describe, expect, it } from "vitest";
import {
  buildNotificationMessage, feedGroupForRole, groupsForRole, NOTIFICATION_EVENTS, NOTIFICATION_GROUPS,
  parseDisabledEvents, ubDateKey, type NotificationEventType, type NotificationPayloads,
} from "@shared/notification-events";
import { INTEGRATION_META, INTEGRATION_PROVIDERS, mergeIntegrationSettings, validateIntegrationSettings } from "@shared/integrations";

/**
 * The privacy rule for phone notifications: ntfy.sh topics are readable by
 * anyone who knows the name, so no message may ever contain a customer's
 * name, phone, address or email. Each builder is fed a payload that ALSO
 * carries sentinel PII (as if a caller spread a whole order row into it) and
 * must not print any of it.
 */
const PII = { customerName: "СЕНТИНЕЛ-НЭР", customerPhone: "99118822", deliveryAddress: "СЕНТИНЕЛ-ХАЯГ", customerEmail: "sentinel@example.invalid" };

const samples: { [K in NotificationEventType]: NotificationPayloads[K] } = {
  "order.placed": { orderNumber: "SG-ABC123", totalMnt: 125000, itemCount: 3, deliveryMethod: "store_pickup", paymentMethod: "qpay", pickupBranchName: "Их наяд плаза" },
  "order.paid": { orderNumber: "SG-ABC123", totalMnt: 125000 },
  "payment.paid_on_closed_order": { orderNumber: "SG-ABC123", orderStatus: "cancelled", paymentStatus: "paid" },
  "payment.underpaid": { orderNumber: "SG-ABC123", paidMnt: 1000, totalMnt: 125000 },
  "order.cancelled_by_customer": { orderNumber: "SG-ABC123", totalMnt: 125000, itemCount: 3 },
  "refund.recorded": { orderNumber: "SG-ABC123", refundMnt: 50000, restocked: true },
  "stock.low_digest": { count: 12, items: Array.from({ length: 12 }, (_, i) => ({ sku: `49000000000${i}`, name: `Бараа ${i}`, quantity: i })) },
  "receipt.posted": { code: "RC-260911-7Q4K", branchName: "Их наяд плаза", supplierName: "Kao Mongolia", lineCount: 12, pieces: 240, unknownCount: 1 },
  "count.submitted": { code: "CT-260911-AB23", branchName: "Их наяд плаза", lineCount: 80, varianceLines: 3 },
  "count.posted": { code: "CT-260911-AB23", branchName: "Агуулах", adjustedLines: 3, netDelta: -2, isOpening: false },
  "integration.test": { groupLabel: "Агуулах" },
};

describe("notification messages", () => {
  for (const type of Object.keys(samples) as NotificationEventType[]) {
    it(`${type}: builds a title and message with no customer PII`, () => {
      const { title, message } = buildNotificationMessage(type, { ...samples[type], ...PII } as never);
      expect(title.trim().length).toBeGreaterThan(3);
      expect(message.trim().length).toBeGreaterThan(3);
      for (const value of Object.values(PII)) {
        expect(title).not.toContain(value);
        expect(message).not.toContain(value);
      }
    });
  }

  it("says what the warehouse needs for a new order", () => {
    const { title, message } = buildNotificationMessage("order.placed", samples["order.placed"]);
    expect(title).toContain("SG-ABC123");
    expect(message).toContain("3 ширхэг");
    expect(message).toContain("Их наяд плаза");
    expect(message).toContain("QPay");
  });

  it("caps the low-stock digest at 8 lines and says how many more", () => {
    const { message } = buildNotificationMessage("stock.low_digest", samples["stock.low_digest"]);
    expect(message.split("\n").filter(line => line.startsWith("•"))).toHaveLength(8);
    expect(message).toContain("өөр 4");
  });

  it("routes every real event to at least one group, always including admin", () => {
    for (const [type, spec] of Object.entries(NOTIFICATION_EVENTS)) {
      if (type === "integration.test") continue;
      expect(spec.groups.length, type).toBeGreaterThan(0);
      expect(spec.groups, type).toContain("admin");
      for (const group of spec.groups) expect(NOTIFICATION_GROUPS).toContain(group);
    }
  });
});

describe("who hears what", () => {
  it("maps roles to groups", () => {
    expect(groupsForRole("admin")).toEqual([...NOTIFICATION_GROUPS]);
    expect(groupsForRole("warehouse")).toEqual(["warehouse"]);
    expect(groupsForRole("finance")).toEqual(["finance"]);
    expect(groupsForRole("staff")).toEqual(["store"]);
    expect(groupsForRole("marketing")).toEqual([]);
    expect(groupsForRole("user")).toEqual([]);
  });

  it("feeds the admin bell from the admin group only (each event once)", () => {
    expect(feedGroupForRole("admin")).toBe("admin");
    expect(feedGroupForRole("staff")).toBe("store");
    expect(feedGroupForRole("user")).toBeNull();
  });

  it("parses the disabled-events setting", () => {
    expect([...parseDisabledEvents(" stock.low_digest, order.paid ,,")]).toEqual(["stock.low_digest", "order.paid"]);
    expect(parseDisabledEvents(undefined).size).toBe(0);
  });

  it("keys daily dedupe by the Ulaanbaatar date, not UTC", () => {
    // 2026-09-11 17:30 UTC is already 2026-09-12 01:30 in Ulaanbaatar.
    expect(ubDateKey(new Date("2026-09-11T17:30:00Z"))).toBe("2026-09-12");
    expect(ubDateKey(new Date("2026-09-11T15:30:00Z"))).toBe("2026-09-11");
  });
});

describe("integration settings", () => {
  it("merges instead of replacing (the 2026-09-11 bug fix)", () => {
    const merged = mergeIntegrationSettings({ apiKey: "a", posNumber: "1" }, { apiKey: "b", extra: " x " }, undefined);
    expect(merged).toEqual({ apiKey: "b", posNumber: "1", extra: "x" });
    expect(mergeIntegrationSettings({ apiKey: "a", posNumber: "1" }, { posNumber: "   " }, ["apiKey"])).toEqual({});
  });

  it("rejects unknown keys for a typed provider but allows them for free-form ones", () => {
    expect(validateIntegrationSettings("ntfy", { nonsense: "1" })).toMatch(/байхгүй/);
    expect(validateIntegrationSettings("ebarimt", { posNumber: "12345678" })).toBeNull();
    expect(validateIntegrationSettings("ebarimt", { "bad key": "1" })).toMatch(/буруу/);
  });

  it("validates URLs and topic names", () => {
    expect(validateIntegrationSettings("ntfy", { serverUrl: "ntfy.sh" })).toMatch(/хаяг/);
    expect(validateIntegrationSettings("ntfy", { serverUrl: "ftp://ntfy.sh" })).toMatch(/http/);
    expect(validateIntegrationSettings("ntfy", { serverUrl: "https://ntfy.sh" })).toBeNull();
    expect(validateIntegrationSettings("ntfy", { topicStore: "short" })).toMatch(/богино/);
    expect(validateIntegrationSettings("ntfy", { topicStore: "has space in the topic name" })).toMatch(/латин/);
    expect(validateIntegrationSettings("ntfy", { topicStore: "sugi-store-AbCdEfGhIjKlMnOp" })).toBeNull();
    expect(validateIntegrationSettings("ntfy", { topicStore: "" })).toBeNull(); // empty = clear
  });

  it("describes every provider", () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      expect(INTEGRATION_META[provider].label.length, provider).toBeGreaterThan(2);
    }
    expect(INTEGRATION_META.ntfy.wiredUp).toBe(true);
    expect(INTEGRATION_META.smartsoftware.wiredUp).toBe(false);
  });
});
