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
    expect(plan.options.ssl).toEqual({ rejectUnauthorized: true, ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----", minVersion: "TLSv1.2" });
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
  it("keeps chain verification but skips hostname matching for a bare IP", () => {
    const { options, transport } = planMysqlConnection("mysql://sugi_app:pw@127.0.0.1:3307/defaultdb?ssl-mode=REQUIRED", { DATABASE_CA_CERT: ca });
    expect(transport).toBe("tls-verified");
    const ssl = options.ssl as { rejectUnauthorized: boolean; ca: string; checkServerIdentity?: unknown };
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toBe(ca);
    expect(typeof ssl.checkServerIdentity).toBe("function");
  });
  it("still checks the hostname for a DNS name (Aiven)", () => {
    const { options } = planMysqlConnection("mysql://u:p@sugi-asayake-db-project-4b75.h.aivencloud.com:25861/defaultdb?ssl-mode=REQUIRED", { DATABASE_CA_CERT: ca });
    const ssl = options.ssl as { checkServerIdentity?: unknown };
    expect(ssl.checkServerIdentity).toBeUndefined();
  });
  it("recognises IPv4 and IPv6 literals only", () => {
    expect(isIpLiteral("140.83.1.2")).toBe(true);
    expect(isIpLiteral("[2001:db8::1]")).toBe(true);
    expect(isIpLiteral("db.example.com")).toBe(false);
  });
});
