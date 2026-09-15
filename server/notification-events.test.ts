import { describe, expect, it } from "vitest";
import {
  buildNotificationMessage, feedGroupForRole, groupsForRole, NOTIFICATION_EVENTS, NOTIFICATION_GROUPS,
  parseDisabledEvents, ubDateKey, type NotificationEventType, type NotificationPayloads,
} from "@shared/notification-events";
import { INTEGRATION_META, INTEGRATION_PROVIDERS, isPrivateHost, mergeIntegrationSettings, validateIntegrationSettings } from "@shared/integrations";

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
  "order.return_requested": { orderNumber: "SG-ABC123", totalMnt: 125000 },
  "careers.application_received": { positionTitle: "Дэлгүүрийн зөвлөх", hasCv: true },
  "stock.low_digest": { count: 12, items: Array.from({ length: 12 }, (_, i) => ({ sku: `49000000000${i}`, name: `Бараа ${i}`, quantity: i })) },
  "receipt.posted": { code: "RC-260911-7Q4K", branchName: "Их наяд плаза", supplierName: "Kao Mongolia", lineCount: 12, pieces: 240, unknownCount: 1 },
  "count.submitted": { code: "CT-260911-AB23", branchName: "Их наяд плаза", lineCount: 80, varianceLines: 3 },
  "count.posted": { code: "CT-260911-AB23", branchName: "Агуулах", adjustedLines: 3, netDelta: -2, isOpening: false },
  "transfer.sent": { code: "TR-260911-QW3E", fromBranchName: "Агуулах", toBranchName: "Их наяд плаза", lineCount: 18, pieces: 320 },
  "transfer.received": { code: "TR-260911-QW3E", toBranchName: "Их наяд плаза", receivedPieces: 315, sentPieces: 320 },
  "transfer.discrepancy": { code: "TR-260911-QW3E", toBranchName: "Их наяд плаза", shortLines: 2, overLines: 1, unexpectedLines: 1, missingPieces: 5, extraPieces: 2, examples: ["Бараа А −3"] },
  "stock.low": { branchName: "Агуулах", productName: "Бараа А", sku: "4900000000001", quantity: 4, threshold: 5 },
  "stock.out": { branchName: "Агуулах", productName: "Бараа А", sku: "4900000000001" },
  "stock.total_out": { productName: "Бараа А", sku: "4900000000001" },
  "stock.ledger_drift": { count: 3 },
  "transfer.stale": { code: "TR-260911-QW3E", toBranchName: "Их наяд плаза", hours: 50 },
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

  it("refuses a private or plain-http address for a cloud vendor the server dials (SSRF)", () => {
    // A vendor adapter that can be pointed at localhost or the LAN by a
    // settings form is a way to read this server's own network.
    for (const bad of ["http://retailapiv2.smartlogic.mn", "https://localhost/api", "https://127.0.0.1", "https://10.0.0.5", "https://192.168.1.20", "https://169.254.169.254/latest/meta-data", "https://172.16.0.1", "https://[::1]", "https://intranet"]) {
      expect(validateIntegrationSettings("smartsoftware", { inventoryBaseUrl: bad }), bad).not.toBeNull();
      expect(validateIntegrationSettings("storepay", { baseUrl: bad }), bad).not.toBeNull();
    }
    expect(validateIntegrationSettings("smartsoftware", { inventoryBaseUrl: "https://retailapiv2.smartlogic.mn" })).toBeNull();
    // ntfy may be self-hosted on the shop's LAN over http -- deliberately allowed.
    expect(validateIntegrationSettings("ntfy", { serverUrl: "http://192.168.1.10:8080" })).toBeNull();
    expect(isPrivateHost("ntfy.sh")).toBe(false);
    expect(isPrivateHost("100.64.0.1")).toBe(true);
  });

  it("describes every provider", () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      expect(INTEGRATION_META[provider].label.length, provider).toBeGreaterThan(2);
    }
    // The two providers real runtime code reads (ntfy: server/_core/ntfy.ts,
    // Smart Software: server/integrations/smartSoftware.ts). The rest only
    // store credentials, and the admin card says so.
    expect(INTEGRATION_META.ntfy.wiredUp).toBe(true);
    expect(INTEGRATION_META.smartsoftware.wiredUp).toBe(true);
    expect(INTEGRATION_META.ebarimt.wiredUp).toBe(false);
    // Smart Software authenticates with a username and password (OAuth2
    // password grant), never an API key -- a field named apiKey here would
    // mean someone mis-read the vendor's docs again.
    const smartFields = INTEGRATION_META.smartsoftware.fields.map(field => field.key);
    expect(smartFields).toContain("username");
    expect(smartFields).toContain("password");
    expect(smartFields).not.toContain("apiKey");
    expect(INTEGRATION_META.smartsoftware.fields.find(field => field.key === "password")?.kind).toBe("secret");
  });
});
