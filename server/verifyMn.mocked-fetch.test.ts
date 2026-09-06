import { afterEach, describe, expect, it, vi } from "vitest";

// This repo's FIRST test that mocks an external HTTP call's response shape
// directly. Every other integration test in this codebase either tests
// only the "unconfigured" config-guard branch (server/qpay.test.ts) or
// relies on genuinely having no real credentials in this environment and
// asserts on the resulting console.log fallback
// (server/order-notifications.integration.test.ts) -- neither approach can
// exercise PENDING -> VERIFIED / EXPIRED / a real 401, which is what this
// file is specifically for. Scoped tightly here: mocks
// server/_core/env.ts's ENV object (so requireApiKey() sees a fake
// configured key and the request actually reaches the mocked fetch below)
// and global fetch, restored in afterEach so no other test file is
// affected by either mock.
vi.mock("./_core/env", () => ({ ENV: { verifyMnApiKey: "test-fake-key" } }));

import { getSessionStatus } from "./verifyMn";

const jsonResponse = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });

describe("verify.mn session status (mocked fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports PENDING while verify.mn has not yet seen the SMS", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ sessionStatus: "PENDING", callbackStatus: "PENDING", expiresAt: new Date(Date.now() + 300_000).toISOString() }, 200)));
    const result = await getSessionStatus("sess-1");
    expect(result.sessionStatus).toBe("PENDING");
  });

  it("reports VERIFIED once the user has texted back the correct code", async () => {
    const verifiedAt = new Date().toISOString();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ sessionStatus: "VERIFIED", callbackStatus: "SENT", verifiedAt, expiresAt: new Date(Date.now() + 60_000).toISOString() }, 200)));
    const result = await getSessionStatus("sess-2");
    expect(result.sessionStatus).toBe("VERIFIED");
    expect(result.verifiedAt).toBe(verifiedAt);
  });

  it("reports EXPIRED once the session's TTL has passed with no verification", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ sessionStatus: "EXPIRED", callbackStatus: "PENDING", expiresAt: new Date(Date.now() - 1000).toISOString() }, 200)));
    const result = await getSessionStatus("sess-3");
    expect(result.sessionStatus).toBe("EXPIRED");
  });

  it("throws, naming the response status, on a 401 (bad API key)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ message: "Invalid API key" }, 401)));
    await expect(getSessionStatus("sess-4")).rejects.toThrow("401");
  });
});
