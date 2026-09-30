import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function credentials(url: string) {
  vi.stubEnv("DATABASE_URL", url);
  const { default: config } = await import("../../drizzle.config");
  if (!("dbCredentials" in config)) throw new Error("Missing MySQL credentials");
  return config.dbCredentials;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_CA_CERT", "");
  vi.stubEnv("DATABASE_CA_CERT_PATH", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("Drizzle migration connection policy", () => {
  it("converts the documented URL to explicit, certificate-verifying TLS options", async () => {
    const options = await credentials("mysql://migration%40user:p%40ss%3Aword@db.example.com:25861/app?ssl-mode=REQUIRED&ssl=false");
    expect(options).toMatchObject({
      host: "db.example.com",
      port: 25861,
      user: "migration@user",
      password: "p@ss:word",
      database: "app",
      ssl: { rejectUnauthorized: true },
    });
    expect(options).not.toHaveProperty("url");
    expect(options).not.toHaveProperty("ssl-mode");
  });

  it("uses the shared CA configuration", async () => {
    vi.stubEnv("DATABASE_CA_CERT", "test-ca\\nsecond-line");
    expect(await credentials("mysql://u:p@db.example.com/app?ssl-mode=REQUIRED"))
      .toHaveProperty("ssl", expect.objectContaining({ ca: "test-ca\nsecond-line", rejectUnauthorized: true }));
  });

  it("fails before connecting when the configured CA file cannot be read", async () => {
    vi.stubEnv("DATABASE_CA_CERT_PATH", "/dev/null/missing-ca.pem");
    await expect(credentials("mysql://u:p@db.example.com/app?ssl-mode=REQUIRED")).rejects.toThrow();
  });

  it.each(["REQUIRED", "VERIFY_CA", "VERIFY_IDENTITY"])("honours explicit %s even on loopback", async (mode) => {
    expect(await credentials(`mysql://u:p@127.0.0.1/app?ssl-mode=${mode}`))
      .toHaveProperty("ssl.rejectUnauthorized", true);
  });

  it("supports the shared sslmode alias", async () => {
    expect(await credentials("mysql://u:p@localhost/app?sslmode=required"))
      .toHaveProperty("ssl.rejectUnauthorized", true);
  });

  it("defaults remote connections to verified TLS", async () => {
    expect(await credentials("mysql://u:p@db.example.com/app"))
      .toHaveProperty("ssl.rejectUnauthorized", true);
  });

  it.each([
    "mysql://u:p@localhost/app",
    "mysql://u:p@db.example.com/app?ssl-mode=DISABLED",
  ])("preserves intentional plaintext policy for %s", async (url) => {
    expect(await credentials(url)).not.toHaveProperty("ssl");
  });

  it("still rejects missing configuration", async () => {
    await expect(credentials("")).rejects.toThrow("DATABASE_URL is required");
  });
});
