import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-01 (security audit E5/E6): with NOTIFICATIONS_SUPPRESS=1 (staging, a
// restored production copy) no email/SMS/push may leave the machine, and the
// "not sent" log line must never carry the message body.
const getPushSubscriptionsForUser = vi.fn(async () => [{ id: 1, endpoint: "https://fcm.googleapis.com/fcm/send/x", p256dh: "p", auth: "a" }]);
vi.mock("./db", () => ({
  deletePushSubscription: async () => undefined,
  getPushSubscriptionsForUser,
  getStoreSettingValue: async () => "",
  touchPushSubscriptions: async () => undefined,
}));

const { ENV } = await import("./_core/env");
const { notifyOwner, sendAccountEmail, sendAccountSms, emailConfigured } = await import("./_core/notification");
const { sendPushToUser } = await import("./_core/webPush");

describe("notification suppression", () => {
  const keys = ["brevoApiKey", "brevoSenderEmail", "ownerEmail", "vapidPublicKey", "vapidPrivateKey", "notificationsSuppressed"] as const;
  const original = Object.fromEntries(keys.map(key => [key, ENV[key]]));
  let fetchMock: ReturnType<typeof vi.fn>;
  let logs: string[];
  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.join(" ")); });
    Object.assign(ENV, { brevoApiKey: "key", brevoSenderEmail: "shop@example.com", ownerEmail: "owner@example.com", vapidPublicKey: "pub", vapidPrivateKey: "priv", notificationsSuppressed: true });
  });
  afterEach(() => {
    Object.assign(ENV, original);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends no email, SMS or owner notification and makes no network call", async () => {
    expect(await sendAccountEmail({ to: "customer@example.com", subject: "Reset", content: "SECRET-LINK-123" })).toBe(false);
    expect(await sendAccountSms({ to: "88112233", content: "GIFT-CODE-XYZ" })).toBe(false);
    expect(await notifyOwner({ title: "T", content: "owner body" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(emailConfigured()).toBe(false);
  });

  it("sends no push and never reads subscriptions", async () => {
    expect(await sendPushToUser(7, { title: "t", body: "b" })).toBe(0);
    expect(getPushSubscriptionsForUser).not.toHaveBeenCalled();
  });

  it("logs one JSON line with a masked recipient and the body length, never the body", async () => {
    await sendAccountEmail({ to: "customer@example.com", subject: "Reset\nforged line", content: "SECRET-LINK-123" });
    await sendAccountSms({ to: "88112233", content: "GIFT-CODE-XYZ" });
    expect(logs).toHaveLength(2);
    for (const line of logs) {
      expect(line).not.toMatch(/SECRET-LINK|GIFT-CODE|customer@example|88112233/);
      expect(line.includes("\n")).toBe(false);
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(JSON.parse(logs[0])).toMatchObject({ channel: "email", reason: "suppressed", to: "***com", length: 15 });
    expect(JSON.parse(logs[1])).toMatchObject({ channel: "sms", to: "***233", length: 13 });
  });

  it("still sends when not suppressed (the guard is the only difference)", async () => {
    ENV.notificationsSuppressed = false;
    expect(await sendAccountEmail({ to: "customer@example.com", subject: "Hi", content: "x" })).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
