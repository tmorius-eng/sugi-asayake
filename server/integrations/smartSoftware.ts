import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { SMART_SOFTWARE_DEFAULT_INVENTORY_URL, SMART_SOFTWARE_DEFAULT_POS_URL } from "../../shared/integrations";
import { registerInventorySyncProvider, type InventorySyncProvider, type StockSnapshot } from "./inventorySync";

/**
 * The Smart Software (Smart POS / Smart Inventory) adapter (2026-09-12) --
 * the one file that talks to the vendor. Written against their published
 * documentation at developer.smartsoftware.mn (an Apidog site: every page is
 * also fetchable as `/api-<id>.md`, index at `/llms.txt`), not guessed:
 *
 *   auth       GET|POST {host}/oauth/token, form-urlencoded username /
 *              password / grant_type=password -> { access_token, expires_in }.
 *              An OAuth2 password grant: the credentials are a username and
 *              a password Smart Logic e-mails after the API contract is
 *              signed, NOT an API key.
 *   locations  GET {inventory}/api/inventory/stock_locations -> [{ id, name }]
 *   products   GET {inventory}/api/inventory/products -> every product with
 *              `barcode` and `stock_locations: [{ location_id, count_on_hand }]`
 *              (their "refresh prices and stock overnight" endpoint: no
 *              paging, no filter).
 *
 * The docs write the token call as a GET carrying a form body (their own
 * curl sample is `--request GET --data-urlencode ...`). fetch() cannot send
 * a body on a GET, so this module uses node:http(s) directly: it tries the
 * standard POST first and falls back to the documented GET-with-body if the
 * server answers 404/405. The transport is injectable, so the unit tests see
 * the exact bytes without a network.
 *
 * What the vendor's POS API does NOT offer, and this adapter therefore does
 * not pretend to do: a list of in-store sales (only the separate Smart
 * Accounting API has one) and any stock-adjustment call. Store stock reaches
 * us as a SNAPSHOT that becomes a stocktake for someone to approve (see
 * runPullSnapshot in ./inventorySync.ts) -- never a silent overwrite. Two
 * warnings from their own docs are the reason: the numbers are accounting
 * stock, which does not count a store's unposted sales, and a Retail setting
 * can limit the feed to products flagged "sell in e-commerce".
 */

export type SmartSoftwareConfig = { username?: string; password?: string; posBaseUrl?: string; inventoryBaseUrl?: string };

export type SmartTransportRequest = { method: "GET" | "POST"; url: string; headers: Record<string, string>; body?: string };
export type SmartTransportResponse = { status: number; body: string };
export type SmartTransport = (request: SmartTransportRequest) => Promise<SmartTransportResponse>;

// The product list is the whole catalogue in one response; give it room.
const TIMEOUT_MS = 30_000;
// Refresh a token this many seconds before the vendor says it expires.
const TOKEN_MARGIN_SECONDS = 60;
const MAX_ERROR_BODY = 200;

export class SmartSoftwareError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "SmartSoftwareError";
  }
}

/** Sends exactly what the request says -- including a body on a GET. */
export const nodeTransport: SmartTransport = request => new Promise((resolve, reject) => {
  const url = new URL(request.url);
  const send = url.protocol === "http:" ? httpRequest : httpsRequest;
  const headers = { ...request.headers };
  if (request.body !== undefined) headers["Content-Length"] = String(Buffer.byteLength(request.body));
  const req = send(url, { method: request.method, headers, timeout: TIMEOUT_MS }, response => {
    const chunks: Buffer[] = [];
    response.on("data", chunk => chunks.push(chunk as Buffer));
    response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    response.on("error", reject);
  });
  req.on("timeout", () => req.destroy(new Error(`timed out after ${TIMEOUT_MS}ms`)));
  req.on("error", reject);
  if (request.body !== undefined) req.write(request.body);
  req.end();
});

const trimSlash = (value: string) => value.trim().replace(/\/+$/, "");

type CachedToken = { token: string; expiresAt: number };
// Keyed by host + username: the POS and Inventory hosts are separate token
// issuers, and a changed username must never reuse the old token.
const tokenCache = new Map<string, CachedToken>();

/** For the tests, and so a rotated password takes effect immediately. */
export function clearSmartSoftwareTokenCache() { tokenCache.clear(); }

function parseJson(body: string, what: string): unknown {
  try { return JSON.parse(body); } catch { throw new SmartSoftwareError(`${what}: хариу JSON биш байна (${body.slice(0, 80).replace(/\s+/g, " ")})`); }
}

export class SmartSoftwareProvider implements InventorySyncProvider {
  readonly name = "smartsoftware";
  private readonly username: string;
  private readonly password: string;
  readonly posBaseUrl: string;
  readonly inventoryBaseUrl: string;

  constructor(config: SmartSoftwareConfig, private readonly transport: SmartTransport = nodeTransport, private readonly now: () => number = Date.now) {
    this.username = config.username?.trim() ?? "";
    this.password = config.password ?? "";
    this.posBaseUrl = trimSlash(config.posBaseUrl || SMART_SOFTWARE_DEFAULT_POS_URL);
    this.inventoryBaseUrl = trimSlash(config.inventoryBaseUrl || SMART_SOFTWARE_DEFAULT_INVENTORY_URL);
  }

  get hasCredentials() { return Boolean(this.username && this.password); }

  /** OAuth2 password grant against one host, cached until shortly before expiry. */
  async token(baseUrl: string): Promise<string> {
    if (!this.hasCredentials) throw new SmartSoftwareError("Smart Software-ийн нэвтрэх нэр, нууц үг тохируулаагүй байна.");
    const key = `${baseUrl}|${this.username}`;
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.token;
    const form = new URLSearchParams({ username: this.username, password: this.password, grant_type: "password" }).toString();
    const headers = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
    const url = `${baseUrl}/oauth/token`;
    let response = await this.send({ method: "POST", url, headers, body: form });
    // Their docs show a GET with a form body; a deployment may accept only that.
    if (response.status === 404 || response.status === 405) response = await this.send({ method: "GET", url, headers, body: form });
    if (response.status < 200 || response.status >= 300) throw new SmartSoftwareError(`Token авахад ${response.status} хариу ирлээ: ${response.body.slice(0, MAX_ERROR_BODY)}`.trim(), response.status);
    const parsed = parseJson(response.body, "Token") as { access_token?: unknown; expires_in?: unknown };
    if (typeof parsed.access_token !== "string" || !parsed.access_token) throw new SmartSoftwareError("Token-ийн хариунд access_token алга.");
    const expiresIn = typeof parsed.expires_in === "number" && parsed.expires_in > 0 ? parsed.expires_in : 3600;
    tokenCache.set(key, { token: parsed.access_token, expiresAt: this.now() + Math.max(1, expiresIn - TOKEN_MARGIN_SECONDS) * 1000 });
    return parsed.access_token;
  }

  private async send(request: SmartTransportRequest): Promise<SmartTransportResponse> {
    try {
      return await this.transport(request);
    } catch (error) {
      throw new SmartSoftwareError(`${request.method} ${new URL(request.url).pathname}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getJson(baseUrl: string, path: string, what: string): Promise<unknown> {
    const token = await this.token(baseUrl);
    const response = await this.send({ method: "GET", url: `${baseUrl}${path}`, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    // A rejected token is never reused: the next call fetches a fresh one.
    if (response.status === 401) tokenCache.delete(`${baseUrl}|${this.username}`);
    if (response.status < 200 || response.status >= 300) throw new SmartSoftwareError(`${what}: ${response.status} хариу ирлээ: ${response.body.slice(0, MAX_ERROR_BODY)}`.trim(), response.status);
    return parseJson(response.body, what);
  }

  async listLocations(): Promise<{ id: string; name: string }[]> {
    const raw = await this.getJson(this.inventoryBaseUrl, "/api/inventory/stock_locations", "Байршлын жагсаалт");
    if (!Array.isArray(raw)) throw new SmartSoftwareError("Байршлын жагсаалт: массив хүлээж байсан.");
    return raw
      .filter((row): row is { id: unknown; name?: unknown } => typeof row === "object" && row !== null && "id" in row)
      .map(row => ({ id: String(row.id).trim(), name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : String(row.id) }))
      .filter(row => row.id);
  }

  /** Every product the vendor knows, with its count at every location. A
   *  product with no entry for a location simply has no number there. */
  async pullStockSnapshot(): Promise<StockSnapshot> {
    const raw = await this.getJson(this.inventoryBaseUrl, "/api/inventory/products", "Барааны жагсаалт");
    if (!Array.isArray(raw)) throw new SmartSoftwareError("Барааны жагсаалт: массив хүлээж байсан.");
    const products: StockSnapshot["products"] = [];
    const locationIds = new Set<string>();
    for (const row of raw) {
      if (typeof row !== "object" || row === null) continue;
      const product = row as { barcode?: unknown; name?: unknown; id?: unknown; stock_locations?: unknown };
      // Barcode is the shared key with our catalogue (products.sku /
      // product_variants.sku); a product without one cannot be matched.
      const sku = typeof product.barcode === "string" ? product.barcode.trim() : String(product.barcode ?? "").trim();
      if (!sku) continue;
      const stock: Record<string, number> = {};
      for (const entry of Array.isArray(product.stock_locations) ? product.stock_locations : []) {
        if (typeof entry !== "object" || entry === null) continue;
        const { location_id: locationRaw, count_on_hand: countRaw } = entry as { location_id?: unknown; count_on_hand?: unknown };
        const locationId = locationRaw === undefined || locationRaw === null ? "" : String(locationRaw).trim();
        if (!locationId) continue;
        const quantity = Number(countRaw);
        if (!Number.isFinite(quantity)) continue;
        locationIds.add(locationId);
        stock[locationId] = (stock[locationId] ?? 0) + quantity;
      }
      products.push({ sku, name: typeof product.name === "string" ? product.name : String(product.id ?? sku), stock });
    }
    return { products, locationIds: Array.from(locationIds), fetchedAt: new Date(this.now()) };
  }

  /** Never throws: the admin card shows `detail` either way. */
  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const locations = await this.listLocations();
      const shown = locations.slice(0, 6).map(location => `${location.id} · ${location.name}`).join(", ");
      return { ok: true, detail: locations.length ? `${locations.length} байршил: ${shown}${locations.length > 6 ? ", …" : ""}` : "Холбогдлоо, гэхдээ нэг ч байршил бүртгэгдээгүй байна." };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}

export function createSmartSoftwareProvider(config: Record<string, string>, transport?: SmartTransport): SmartSoftwareProvider {
  return new SmartSoftwareProvider(config, transport);
}

// Registered on import. The runner only receives a provider once the
// integration is switched on AND both credentials are set.
registerInventorySyncProvider(config => {
  const provider = createSmartSoftwareProvider(config);
  return provider.hasCredentials ? provider : null;
});
