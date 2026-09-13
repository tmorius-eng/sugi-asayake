// Turns DATABASE_URL into explicit mysql2 connection options.
//
// 2026-09-09 deep audit finding: the pool was created with
// `{ uri: process.env.DATABASE_URL }`. mysql2 parses that URI itself and
// does NOT understand `?ssl-mode=REQUIRED` (that flag belongs to the
// mysql CLI, which the backup scripts drive correctly) -- it logged
// "Ignoring invalid configuration option ... ssl-mode" on every boot and
// opened the connection to Aiven WITHOUT TLS. Verified on the live service:
// `SHOW SESSION STATUS LIKE 'Ssl_cipher'` came back empty and the server
// has `require_secure_transport=OFF`, so nothing on either side forced
// encryption. Every query -- customer data, order rows, the password
// handshake -- crossed the public Internet to Bangalore in plaintext.
//
// Rules, in order:
// 1. Loopback hosts (local MySQL, the offline fallback in CLAUDE.md) stay
//    plaintext -- TLS there is pointless and the local server has no cert.
// 2. Everything else gets TLS. If DATABASE_CA_CERT (PEM text) or
//    DATABASE_CA_CERT_PATH (file) is set, the server certificate is
//    verified against it -- Aiven signs with a per-project CA that no
//    system root store knows (rejectUnauthorized:true against system roots
//    fails with HANDSHAKE_SSL_ERROR, confirmed). Without a CA we still
//    encrypt but cannot authenticate the server; that is logged once, as a
//    warning, because encrypt-only is a real improvement over plaintext
//    but is not the finished state. Aiven Console -> service -> Overview
//    -> "CA certificate" is where the PEM comes from.
// 3. `ssl-mode=DISABLED` in the URL is honoured (explicit opt-out), any
//    other query parameter is dropped rather than forwarded, so mysql2
//    never sees an option it doesn't know.
import { readFileSync } from "node:fs";

export type MysqlSslOptions = { rejectUnauthorized: boolean; ca?: string; minVersion: "TLSv1.2" };

export type MysqlConnectionOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: MysqlSslOptions;
};

export type ConnectionPlan = {
  options: MysqlConnectionOptions;
  /** Human-readable summary for the startup log. */
  transport: "plaintext-loopback" | "plaintext-explicit" | "tls-verified" | "tls-unverified";
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** IPv4 dotted quad or bracketed/plain IPv6, as URL.hostname reports it. */
export function isIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || (bare.includes(":") && /^[0-9a-f:.]+$/i.test(bare));
}

export function loadCaCertificate(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const inline = env.DATABASE_CA_CERT?.trim();
  if (inline) return inline.replace(/\\n/g, "\n");
  const path = env.DATABASE_CA_CERT_PATH?.trim();
  if (path) return readFileSync(path, "utf8");
  return undefined;
}

export function planMysqlConnection(databaseUrl: string, env: NodeJS.ProcessEnv = process.env): ConnectionPlan {
  const url = new URL(databaseUrl);
  if (url.protocol !== "mysql:" && url.protocol !== "mysqls:") {
    throw new Error(`DATABASE_URL must start with mysql://, got ${url.protocol}`);
  }
  const options: MysqlConnectionOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
  const sslMode = (url.searchParams.get("ssl-mode") ?? url.searchParams.get("sslmode") ?? "").toUpperCase();

  if (LOOPBACK.has(url.hostname) && sslMode !== "REQUIRED" && sslMode !== "VERIFY_CA" && sslMode !== "VERIFY_IDENTITY") {
    return { options, transport: "plaintext-loopback" };
  }
  if (sslMode === "DISABLED") {
    return { options, transport: "plaintext-explicit" };
  }
  const ca = loadCaCertificate(env);
  if (!ca) {
    options.ssl = { rejectUnauthorized: false, minVersion: "TLSv1.2" };
    return { options, transport: "tls-unverified" };
  }
  // A MySQL reached by bare IP -- an Oracle Cloud HeatWave endpoint through
  // an SSH tunnel (127.0.0.1) or a VM by its address (2026-09-13) -- presents
  // a certificate whose CN/SAN name the address, not what we typed, so Node
  // would reject it on hostname mismatch even though the chain is pinned to
  // the exact CA we shipped. For an IP-literal host the CA pin IS the
  // identity check (only a server holding a key signed by that private CA
  // can pass), so hostname matching is skipped there and nowhere else: a DNS
  // name such as the Aiven hostname still gets the full identity check.
  const ipLiteral = isIpLiteral(url.hostname);
  options.ssl = {
    rejectUnauthorized: true,
    ca,
    minVersion: "TLSv1.2",
    ...(ipLiteral ? { checkServerIdentity: () => undefined } : {}),
  };
  return { options, transport: "tls-verified" };
}

export function describeTransport(plan: ConnectionPlan): string {
  switch (plan.transport) {
    case "plaintext-loopback":
      return `MySQL: plaintext to loopback ${plan.options.host}:${plan.options.port} (local database).`;
    case "plaintext-explicit":
      return `MySQL: TLS DISABLED by ssl-mode=DISABLED in DATABASE_URL for ${plan.options.host} -- do not use this against a remote database.`;
    case "tls-verified":
      return `MySQL: TLS to ${plan.options.host}:${plan.options.port}, server certificate verified against DATABASE_CA_CERT.`;
    case "tls-unverified":
      return `MySQL: TLS to ${plan.options.host}:${plan.options.port} but the server certificate is NOT verified -- set DATABASE_CA_CERT (Aiven Console -> service -> Overview -> CA certificate) to close the remaining man-in-the-middle gap.`;
  }
}
