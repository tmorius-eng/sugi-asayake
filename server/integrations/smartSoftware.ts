import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { SMART_SOFTWARE_DEFAULT_INVENTORY_URL, SMART_SOFTWARE_DEFAULT_POS_URL } from "../../shared/integrations";
import { registerInventorySyncProvider, type CatalogSnapshot, type InventorySyncProvider, type StockSnapshot, type VendorDiscount, type VendorProduct } from "./inventorySync";

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

/**
 * Their newer (Retail-family) services wrap every payload as
 * { Success, Message, ErrorCode, ExceptionType, Data: [...] } while the older
 * Inventory endpoints answer with a bare array. Our default inventory host IS
 * the Retail one, so accepting only the bare array would have failed against
 * the documented response the moment real credentials arrived.
 */
function unwrapList(payload: unknown, what: string): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const envelope = payload as { Success?: unknown; Message?: unknown; Data?: unknown };
    if (Array.isArray(envelope.Data)) return envelope.Data;
    if (envelope.Success === false) throw new SmartSoftwareError(`${what}: ${typeof envelope.Message === "string" && envelope.Message ? envelope.Message : "вендор татгалзлаа."}`);
  }
  throw new SmartSoftwareError(`${what}: массив хүлээж байсан.`);
}

const asText = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
};
const asMoney = (value: unknown): number | null => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
};

/** A YYYY-MM-DD (or ISO) day, compared as a day and never as an instant. */
const asDay = (value: unknown): string | null => {
  const text = asText(value);
  if (!text) return null;
  const day = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
};

function readDiscounts(raw: unknown, today: string): { active: VendorDiscount | null; upcoming: VendorDiscount[] } {
  const all: VendorDiscount[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as { begin_date?: unknown; end_date?: unknown; percent?: unknown; amount?: unknown };
    const percent = Number(row.percent);
    const discount: VendorDiscount = {
      beginDate: asDay(row.begin_date),
      endDate: asDay(row.end_date),
      percent: Number.isFinite(percent) && percent > 0 ? percent : null,
      amountMnt: asMoney(row.amount),
    };
    if (discount.percent === null && discount.amountMnt === null) continue;
    all.push(discount);
  }
  const started = (discount: VendorDiscount) => !discount.beginDate || discount.beginDate <= today;
  const ended = (discount: VendorDiscount) => Boolean(discount.endDate) && discount.endDate! < today;
  const live = all.filter(discount => started(discount) && !ended(discount));
  // Their docs describe the list as "in force now plus what is coming"; when
  // several overlap, the deepest one is what the shop's own till would ring.
  const active = live.sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0) || (b.amountMnt ?? 0) - (a.amountMnt ?? 0))[0] ?? null;
  return { active, upcoming: all.filter(discount => !started(discount)) };
}

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
    // 2026-09-23: `unwrapList` — `pullCatalogSnapshot` аль хэдийн үүгээр
    // явдаг ("бидний анхдагч хост нь ЯГ Retail-ийнх тул зөвхөн нүцгэн массив
    // хүлээх нь баримтжуулсан хариуны хэлбэрт унах байсан" гэж тэндхийн
    // тайлбар хэлдэг). Энэ нь татгалздаг байсан тул хэрэв Retail
    // `stock_locations`-ыг мөн `{ Success, Data }`-д ороовол "Холболт
    // шалгах" товч алдаа өгөх атлаа 15 минутын sync ажиллаж байдаг байв.
    return unwrapList(raw, "Байршлын жагсаалт")
      .filter((row): row is { id: unknown; name?: unknown } => typeof row === "object" && row !== null && "id" in row)
      .map(row => ({ id: String(row.id).trim(), name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : String(row.id) }))
      .filter(row => row.id);
  }

  /**
   * Every product the vendor knows: its count at every location, its price,
   * the discounts on it, and its label text. One request -- their own docs
   * call this the "refresh prices and stock overnight" endpoint, with no
   * paging and no filter.
   *
   * Two settings on THEIR side decide what arrives, and both have bitten
   * integrations before (their docs say so outright): "ECommerce борлуулах
   * бараа" limits the feed to products flagged for online sale, and "Онлайн
   * худалдааны үлдэгдэл татах" limits which locations report stock at all.
   * A short feed is therefore a configuration signal, never permission to
   * zero a catalogue -- see runPullSnapshot's sanity gate.
   */
  async pullCatalogSnapshot(): Promise<CatalogSnapshot> {
    const raw = await this.getJson(this.inventoryBaseUrl, "/api/inventory/products", "Барааны жагсаалт");
    const rows = unwrapList(raw, "Барааны жагсаалт");
    // 2026-09-23: Улаанбаатарын өдрөөр. `toISOString()` нь UTC тул 00:00–08:00
    // (UB) хооронд өнөөдрөөс эхэлсэн хямдрал "ирээдүйн", өчигдөр дууссан нь
    // "идэвхтэй" гэж ангилагдаж, зөрүүний дэлгэц дээрх (улмаар админы
    // хэрэглэх) үнэ буруу болдог байв.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(this.now()));
    const products: VendorProduct[] = [];
    const locationIds = new Set<string>();
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const product = row as Record<string, unknown>;
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
      const discounts = readDiscounts(product.item_discounts, today);
      // "instructions" and "termsOfUse" are two label fields that both answer
      // "how do I use this"; a product can carry either or both.
      const instructions = asText(product.instructions);
      const termsOfUse = asText(product.termsOfUse);
      products.push({
        sku,
        name: typeof product.name === "string" && product.name.trim() ? product.name.trim() : String(product.id ?? sku),
        stock,
        priceMnt: asMoney(product.price),
        basePriceMnt: asMoney(product.baseprice),
        activeDiscount: discounts.active,
        upcomingDiscounts: discounts.upcoming,
        facts: {
          ingredients: asText(product.ingredients),
          usageInstructions: instructions && termsOfUse && instructions !== termsOfUse ? `${instructions}\n\n${termsOfUse}` : instructions ?? termsOfUse,
          warnings: asText(product.warning),
          brand: asText(product.brandName),
          category: asText(product.itemSubCategoryName) ?? asText(product.itemCatogoryName),
          nameEng: asText(product.nameeng),
          vendorName: asText(product.vendorName),
        },
        isActive: String(product.activeStatus ?? "Y").trim().toUpperCase() !== "N",
      });
    }
    return { products, locationIds: Array.from(locationIds), fetchedAt: new Date(this.now()) };
  }

  /** The counts alone, for the stock path that has always consumed them. */
  async pullStockSnapshot(): Promise<StockSnapshot> {
    const snapshot = await this.pullCatalogSnapshot();
    return {
      products: snapshot.products.map(product => ({ sku: product.sku, name: product.name, stock: product.stock })),
      locationIds: snapshot.locationIds,
      fetchedAt: snapshot.fetchedAt,
    };
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
