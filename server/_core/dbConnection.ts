// DATABASE_URL-ийг mysql2-ийн тодорхой холболтын option болгоно.
//
// 2026-09-09 гүнзгий аудитын олдвор: pool `{ uri: process.env.DATABASE_URL }`-
// аар үүсдэг байв. mysql2 URI-г өөрөө parse хийдэг бөгөөд `?ssl-mode=REQUIRED`-
// ийг ойлгодоггүй (тэр flag mysql CLI-ийнх, backup script-үүд зөв дамжуулдаг) —
// boot бүрт "Ignoring invalid configuration option ... ssl-mode" бичиж, Aiven руу
// TLS-ГҮЙ холбогдож байв. Амьд сервер дээр баталгаажсан: `SHOW SESSION STATUS
// LIKE 'Ssl_cipher'` хоосон, сервер `require_secure_transport=OFF` тул аль ч тал
// шифрлэлт шаардаагүй. Query бүр — харилцагчийн өгөгдөл, захиалга, нууц үгийн
// handshake — Бангалор хүртэл нээлттэй интернэтээр plaintext явж байв.
//
// Дүрэм, дарааллаар:
// 1. Loopback host (локал MySQL, docs/PROJECT-GUIDE.md-ийн офлайн fallback)
//    plaintext хэвээр — тэнд TLS утгагүй, локал серверт сертификат байхгүй.
// 2. Бусад бүгд TLS. DATABASE_CA_CERT (PEM текст) эсвэл DATABASE_CA_CERT_PATH
//    (файл) тавигдсан бол серверийн сертификатыг түүгээр шалгана — Aiven төслийн
//    CA-аар гарын үсэг зурдаг тул системийн root store мэдэхгүй (системийн root-
//    оор rejectUnauthorized:true HANDSHAKE_SSL_ERROR өгдгийг баталгаажуулсан). CA-
//    гүй бол шифрлэсээр ч серверийг баталгаажуулж чадахгүй; үүнийг нэг удаа warning
//    бичнэ — зөвхөн шифрлэлт нь plaintext-ээс бодит сайжруулалт ч дууссан төлөв
//    биш. PEM нь Aiven Console -> service -> Overview -> "CA certificate"-ээс.
// 3. URL дахь `ssl-mode=DISABLED` хүндэтгэгдэнэ (санаатай татгалзал), бусад query
//    параметр дамжуулагдахгүй хаягдана, тиймээс mysql2 мэдэхгүй option харахгүй.
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
