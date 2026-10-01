import { describe, expect, it } from "vitest";
import { describeTransport, planMysqlConnection, isIpLiteral } from "./dbConnection";

const AIVEN = "mysql://avnadmin:p%40ss%3Aword@sugi-asayake-db-project-4b75.h.aivencloud.com:25861/defaultdb?ssl-mode=REQUIRED";

describe("planMysqlConnection", () => {
  it("parses credentials, host, port and database out of the URL (percent-decoded)", () => {
    const { options } = planMysqlConnection(AIVEN, {});
    expect(options).toMatchObject({ host: "sugi-asayake-db-project-4b75.h.aivencloud.com", port: 25861, user: "avnadmin", password: "p@ss:word", database: "defaultdb" });
  });

  it("never forwards ssl-mode (or any other URL query option) to mysql2", () => {
    const { options } = planMysqlConnection(AIVEN, {});
    expect(Object.keys(options).sort()).toEqual(["database", "host", "password", "port", "ssl", "user"]);
  });

  it("enables TLS for a remote host even without a CA, and says so", () => {
    const plan = planMysqlConnection(AIVEN, {});
    expect(plan.transport).toBe("tls-unverified");
    expect(plan.options.ssl).toEqual({ rejectUnauthorized: false, minVersion: "TLSv1.2" });
    expect(describeTransport(plan)).toContain("NOT verified");
  });

  it("verifies the server certificate when DATABASE_CA_CERT is set (escaped newlines allowed)", () => {
    const plan = planMysqlConnection(AIVEN, { DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----" });
    expect(plan.transport).toBe("tls-verified");
    expect(plan.options.ssl).toEqual({ rejectUnauthorized: true, ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----", minVersion: "TLSv1.2", verifyIdentity: true });
  });

  it("refuses VERIFY_CA / VERIFY_IDENTITY without a CA instead of silently skipping verification", () => {
    expect(() => planMysqlConnection("mysql://u:p@db.example.com/app?ssl-mode=VERIFY_CA", {})).toThrow(/no CA certificate/);
    expect(() => planMysqlConnection("mysql://u:p@db.example.com/app?ssl-mode=VERIFY_IDENTITY", {})).toThrow(/no CA certificate/);
    expect(() => planMysqlConnection("mysql://u:p@localhost/app?ssl-mode=VERIFY_CA", {})).toThrow(/no CA certificate/);
  });

  it("refuses to run in production without a CA, but not for plaintext loopback or an explicit DISABLED", () => {
    expect(() => planMysqlConnection(AIVEN, { NODE_ENV: "production" })).toThrow(/production without a CA/);
    expect(planMysqlConnection("mysql://root:x@127.0.0.1/sugi", { NODE_ENV: "production" }).transport).toBe("plaintext-loopback");
    expect(planMysqlConnection("mysql://u:p@db.example.com/app?ssl-mode=DISABLED", { NODE_ENV: "production" }).transport).toBe("plaintext-explicit");
    expect(planMysqlConnection(AIVEN, { NODE_ENV: "production", DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----" }).transport).toBe("tls-verified");
  });

  it("enables TLS for a remote host that has no ssl-mode flag at all", () => {
    expect(planMysqlConnection("mysql://u:p@db.example.com/app", {}).transport).toBe("tls-unverified");
  });

  it("keeps loopback databases plaintext unless the URL insists on TLS", () => {
    expect(planMysqlConnection("mysql://root:Zulaa123@127.0.0.1:3306/sugi_asayake", {}).transport).toBe("plaintext-loopback");
    expect(planMysqlConnection("mysql://root:x@localhost/sugi", {}).options.ssl).toBeUndefined();
    expect(planMysqlConnection("mysql://root:x@localhost/sugi?ssl-mode=REQUIRED", {}).transport).toBe("tls-unverified");
  });

  it("honours an explicit ssl-mode=DISABLED opt-out, but describes it as unsafe", () => {
    const plan = planMysqlConnection("mysql://u:p@db.example.com/app?ssl-mode=DISABLED", {});
    expect(plan.transport).toBe("plaintext-explicit");
    expect(plan.options.ssl).toBeUndefined();
    expect(describeTransport(plan)).toContain("do not use this against a remote database");
  });

  it("rejects a non-mysql URL instead of guessing", () => {
    expect(() => planMysqlConnection("postgres://u:p@h/db", {})).toThrow(/mysql:/);
  });
});

describe("IP-literal hosts with a pinned CA (HeatWave through an SSH tunnel, or a VM by address)", () => {
  const ca = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
  it("pins the CA (chain verification only) for a bare IP: no verifyIdentity, no ineffective checkServerIdentity", () => {
    const { options, transport } = planMysqlConnection("mysql://sugi_app:pw@127.0.0.1:3307/defaultdb?ssl-mode=REQUIRED", { DATABASE_CA_CERT: ca });
    expect(transport).toBe("tls-verified");
    expect(options.ssl).toEqual({ rejectUnauthorized: true, ca, minVersion: "TLSv1.2" });
    expect(planMysqlConnection("mysql://u:p@10.0.1.227/defaultdb?ssl-mode=VERIFY_CA", { DATABASE_CA_CERT: ca, NODE_ENV: "production" }).transport).toBe("tls-verified");
  });
  it("turns on verifyIdentity for a DNS name (mysql2 only honours ssl.verifyIdentity)", () => {
    const { options } = planMysqlConnection("mysql://u:p@sugi-asayake-db-project-4b75.h.aivencloud.com:25861/defaultdb?ssl-mode=REQUIRED", { DATABASE_CA_CERT: ca });
    expect(options.ssl).toEqual({ rejectUnauthorized: true, ca, minVersion: "TLSv1.2", verifyIdentity: true });
  });
  it("throws for VERIFY_IDENTITY on an IP literal rather than pretending to verify the identity", () => {
    expect(() => planMysqlConnection("mysql://u:p@127.0.0.1:3307/defaultdb?ssl-mode=VERIFY_IDENTITY", { DATABASE_CA_CERT: ca })).toThrow(/VERIFY_IDENTITY cannot be honoured/);
  });
  it("recognises IPv4 and IPv6 literals only", () => {
    expect(isIpLiteral("140.83.1.2")).toBe(true);
    expect(isIpLiteral("[2001:db8::1]")).toBe(true);
    expect(isIpLiteral("db.example.com")).toBe(false);
  });
});
