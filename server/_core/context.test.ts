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

  // 2026-09-20 (audit P2-1): DATABASE_URL is the second hard requirement --
  // without it getDb() returns null and every procedure fails with "Database
  // is not available" after the port is already open.
  it("throws when NODE_ENV=production and DATABASE_URL is unset", async () => {
    vi.resetModules();
    vi.doMock("./env", () => ({ ENV: { isProduction: true, cookieSecret: "a-real-secret", databaseUrl: "" } }));
    const { assertProductionSecrets } = await import("./context");
    expect(() => assertProductionSecrets()).toThrow(/DATABASE_URL must be set in production/);
    vi.doUnmock("./env");
  });

  it("does not throw when NODE_ENV=production and both JWT_SECRET and DATABASE_URL are set (missing optional keys only warn)", async () => {
    vi.resetModules();
    vi.doMock("./env", () => ({ ENV: { isProduction: true, cookieSecret: "0123456789abcdef0123456789abcdef0123456789abcdef", databaseUrl: "mysql://u:p@db.internal:3306/shop", integrationsEncryptionKey: "", s3Bucket: "", publicBaseUrl: "", ownerEmail: "" } }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { assertProductionSecrets } = await import("./context");
    expect(() => assertProductionSecrets()).not.toThrow();
    // One line per missing optional setting, so an operator sees exactly what is off.
    expect(warn.mock.calls.map(call => String(call[0])).filter(line => line.startsWith("[env] production is missing"))).toHaveLength(4);
    warn.mockRestore();
    vi.doUnmock("./env");
  });

  // 2026-09-27: сул/баримтад бичигдсэн JWT_SECRET-д тод анхааруулга (сайтыг зогсоохгүй).
  it("warns first about a short or documented-placeholder JWT_SECRET in production", async () => {
    vi.resetModules();
    vi.doMock("./env", () => ({ ENV: { isProduction: true, cookieSecret: "local-test-secret-12345", databaseUrl: "mysql://u:p@db.internal:3306/shop", integrationsEncryptionKey: "a".repeat(64), s3Bucket: "b", s3AccessKeyId: "k", s3SecretAccessKey: "s", s3PublicBaseUrl: "https://x", publicBaseUrl: "https://x", ownerEmail: "o@x" } }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { assertProductionSecrets, isWeakJwtSecret } = await import("./context");
    expect(() => assertProductionSecrets()).not.toThrow();
    const lines = warn.mock.calls.map(call => String(call[0]));
    expect(lines[0]).toMatch(/STRONG JWT_SECRET/);
    expect(isWeakJwtSecret("short")).toBe(true);
    expect(isWeakJwtSecret("0123456789abcdef0123456789abcdef")).toBe(false);
    warn.mockRestore();
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
