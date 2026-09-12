import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * server/storepay.ts against a stubbed fetch and stubbed settings: the exact
 * request StorePay receives (two credential pairs, one of them as HTTP
 * Basic), and their envelope rule -- HTTP 200 with status != "Success" is a
 * FAILURE, which is the mistake worth a test.
 */
const settings = {
  authUrl: "https://auth.storepay.test/",
  baseUrl: "https://api.storepay.test",
  appUsername: "app-user",
  appPassword: "app-pass",
  username: "basic-user",
  password: "basic-pass",
  storeId: "STORE-7",
};

let activeSettings: Record<string, string> | null = settings;
vi.mock("./db", () => ({
  getActiveIntegrationConfig: async () => activeSettings,
  getOrderById: async () => null,
  getPaymentAttemptByInvoiceId: async () => undefined,
  markQPayPaymentAttemptFailed: async () => undefined,
  markQPayPaymentAttemptPaid: async () => ({ orderUpdated: true }),
  storeQPayPaymentAttemptResponse: async () => undefined,
}));

const { checkStorepayLoan, clearStorepayTokenCache, createStorepayLoan, getStorepayAvailability, normaliseMobileNumber, readStorepayEnvelope, storepayPossibleAmount } = await import("./storepay");

const tokenResponse = () => new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 });
const ok = (value: unknown) => new Response(JSON.stringify({ value, msgList: [], attrs: null, status: "Success" }), { status: 200 });

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }));
  return calls;
}

describe("StorePay", () => {
  beforeEach(() => { activeSettings = { ...settings }; clearStorepayTokenCache(); });
  afterEach(() => vi.unstubAllGlobals());

  it("accepts a Mongolian mobile number in the forms people actually type", () => {
    expect(normaliseMobileNumber("99112233")).toBe("99112233");
    expect(normaliseMobileNumber("9911 2233")).toBe("99112233");
    expect(normaliseMobileNumber("+976-9911-2233")).toBe("99112233");
    expect(normaliseMobileNumber("97699112233")).toBe("99112233");
    expect(normaliseMobileNumber("1234")).toBeNull();
    expect(normaliseMobileNumber("12345678")).toBeNull(); // no Mongolian mobile starts with 1
  });

  it("treats a 200 whose status is not Success as a failure, with their reason", () => {
    expect(readStorepayEnvelope<number>({ status: "Success", value: 42, msgList: [] }, "x")).toBe(42);
    expect(() => readStorepayEnvelope({ status: "Failed", msgList: [{ code: "E01", text: "Хэрэглэгч олдсонгүй" }] }, "Зээл үүсгэх"))
      .toThrow(/E01 Хэрэглэгч олдсонгүй/);
  });

  it("signs the token request with the app pair in the query and the other pair as Basic auth", async () => {
    const calls = stubFetch((url) => url.includes("/oauth/token") ? tokenResponse() : ok("5500"));
    await createStorepayLoan({ mobileNumber: "99112233", description: "SUGI ASAYAKE SG-1", amountMnt: 120_000, callbackUrl: "https://shop.mn/api/payments/storepay/callback" });
    const token = calls[0];
    expect(token.url.startsWith("https://auth.storepay.test/oauth/token?")).toBe(true);
    const query = new URL(token.url).searchParams;
    expect(Object.fromEntries(query)).toEqual({ grant_type: "password", username: "app-user", password: "app-pass" });
    const basic = (token.init.headers as Record<string, string>).Authorization;
    expect(Buffer.from(basic.replace("Basic ", ""), "base64").toString()).toBe("basic-user:basic-pass");
  });

  it("creates the loan with the store id, amount and callback, and returns the loan id", async () => {
    const calls = stubFetch((url) => url.includes("/oauth/token") ? tokenResponse() : ok(5500));
    const loan = await createStorepayLoan({ mobileNumber: "99112233", description: "SUGI ASAYAKE SG-1", amountMnt: 120_000, callbackUrl: "https://shop.mn/cb" });
    expect(loan.loanId).toBe("5500");
    const request = calls[1];
    expect(request.url).toBe("https://api.storepay.test/merchant/loan");
    expect((request.init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(String(request.init.body))).toEqual({ storeId: "STORE-7", mobileNumber: "99112233", description: "SUGI ASAYAKE SG-1", amount: "120000.00", callbackUrl: "https://shop.mn/cb" });
  });

  it("reuses the token across calls", async () => {
    const calls = stubFetch((url) => url.includes("/oauth/token") ? tokenResponse() : ok(true));
    await checkStorepayLoan("5500");
    await checkStorepayLoan("5500");
    expect(calls.filter(call => call.url.includes("/oauth/token"))).toHaveLength(1);
    expect(calls[1].url).toBe("https://api.storepay.test/merchant/loan/check/5500");
  });

  it("reads the approval flag as a boolean, not as truthiness", async () => {
    stubFetch((url) => url.includes("/oauth/token") ? tokenResponse() : ok(false));
    await expect(checkStorepayLoan("5500")).resolves.toMatchObject({ approved: false });
    clearStorepayTokenCache();
    stubFetch((url) => url.includes("/oauth/token") ? tokenResponse() : ok(true));
    await expect(checkStorepayLoan("5500")).resolves.toMatchObject({ approved: true });
  });

  it("reports what the customer may borrow, and 0 rather than a negative", async () => {
    stubFetch((url) => url.includes("/oauth/token") ? tokenResponse() : ok(450_000));
    await expect(storepayPossibleAmount("99112233")).resolves.toBe(450_000);
    clearStorepayTokenCache();
    stubFetch((url) => url.includes("/oauth/token") ? tokenResponse() : ok(-1));
    await expect(storepayPossibleAmount("99112233")).resolves.toBe(0);
  });

  it("refuses a loan StorePay did not number", async () => {
    stubFetch((url) => url.includes("/oauth/token") ? tokenResponse() : ok(0));
    await expect(createStorepayLoan({ mobileNumber: "99112233", description: "x", amountMnt: 1000, callbackUrl: "https://shop.mn/cb" })).rejects.toThrow(/дугаар/);
  });

  it("stays switched off until every credential is present", async () => {
    activeSettings = { ...settings, storeId: "" };
    await expect(getStorepayAvailability()).resolves.toEqual({ configured: false });
    activeSettings = null; // integration not switched on at all
    await expect(getStorepayAvailability()).resolves.toEqual({ configured: false });
    await expect(storepayPossibleAmount("99112233")).rejects.toThrow(/тохируулаагүй/);
    activeSettings = { ...settings };
    await expect(getStorepayAvailability()).resolves.toEqual({ configured: true });
  });
});
