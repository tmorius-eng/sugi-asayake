import { describe, expect, it, vi } from "vitest";

// Audit finding BUG-001: assertProductionSecrets() is the fix for a real gap
// -- nothing previously stopped the server from starting in production with
// no JWT_SECRET set, silently falling back to a hardcoded, publicly-committed
// signing key. Mocks ./env the same way server/verifyMn.test.ts already does,
// so this never touches the real .env / real ENV singleton.
describe("assertProductionSecrets", () => {
  it("throws when NODE_ENV=production and JWT_SECRET is unset", async () => {
    vi.resetModules();
    vi.doMock("./env", () => ({ ENV: { isProduction: true, cookieSecret: "" } }));
    const { assertProductionSecrets } = await import("./context");
    expect(() => assertProductionSecrets()).toThrow(/JWT_SECRET must be set in production/);
    vi.doUnmock("./env");
  });

  it("does not throw when NODE_ENV=production and JWT_SECRET is set", async () => {
    vi.resetModules();
    vi.doMock("./env", () => ({ ENV: { isProduction: true, cookieSecret: "a-real-secret" } }));
    const { assertProductionSecrets } = await import("./context");
    expect(() => assertProductionSecrets()).not.toThrow();
    vi.doUnmock("./env");
  });

  it("does not throw outside production even with no JWT_SECRET (local dev/CI/vitest)", async () => {
    vi.resetModules();
    vi.doMock("./env", () => ({ ENV: { isProduction: false, cookieSecret: "" } }));
    const { assertProductionSecrets } = await import("./context");
    expect(() => assertProductionSecrets()).not.toThrow();
    vi.doUnmock("./env");
  });
});
