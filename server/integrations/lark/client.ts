import { readBodyWithLimit } from "../../_core/safeHttp";
import type { LarkConfig } from "./config";

/**
 * Lark Open Platform-ийн нимгэн клиент (2026-10-03).
 *
 * Node SDK (`@larksuiteoapi/node-sdk`) ашиглахгүй: VM 954 MB-тай (сул ~300 MB),
 * бидэнд хэрэгтэй нь цөөн REST дуудлага. Хост нь зөвхөн LARK_DOMAINS (config.ts
 * шалгасан) тул `safeRequest` биш энгийн `fetch` + timeout + байтын хязгаар.
 *
 * Lark-ийн хариу HTTP 200 байсан ч `code !== 0` бол алдаа. Token 2 цаг хүчинтэй;
 * 30 минутаас бага үлдвэл шинээр авна (Lark өөрөө ч тэр үед шинийг өгдөг).
 */

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TOKEN_REFRESH_MARGIN_MS = 30 * 60_000;

/** Token хүчингүй/хугацаа дууссан — кэшийг цэвэрлээд нэг удаа дахин оролдоно.
 *  Lark-ийн token-ий алдаанууд 9999166x мужид; консолоос нууцыг гаднаас
 *  шинэчилбэл хуучин token хугацаанаасаа өмнө хүчингүй болдог тул HTTP 401-ийг ч. */
const isInvalidTokenResponse = (code: unknown, httpStatus: number) =>
  httpStatus === 401 || (typeof code === "number" && code >= 99991660 && code <= 99991669);
/** Дахин оролдоод засагдахгүй: бот чатад байхгүй, буруу параметр, бот идэвхгүй,
 *  scope дутуу, апп-ын нууц буруу. Admin тохиргоо засах хэрэгтэй. */
const PERMANENT_CODES = new Set([10003, 10014, 230001, 230002, 230006, 99991672]);
const RATE_LIMIT_CODE = 99991400;

export class LarkApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly httpStatus: number | null,
    readonly permanent: boolean,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "LarkApiError";
  }
}

export type LarkChat = { chatId: string; name: string };
export type LarkBotInfo = { name: string; openId: string | null; active: boolean };

export interface LarkClient {
  botInfo(): Promise<LarkBotInfo>;
  /** Бот гишүүн болсон бүлэг чатууд (ихдээ 500). */
  listChats(): Promise<LarkChat[]>;
  /** `uuid` — Lark нэг цагийн дотор ижил uuid-тай хоёр дахь илгээлтийг хаядаг
   *  тул retry давхар мессеж үүсгэхгүй (≤50 тэмдэгт). */
  sendCard(chatId: string, card: object, uuid?: string): Promise<{ messageId: string | null }>;
  /** Phase 3 (Base) — ерөнхий дуудлага. */
  request<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, options?: { query?: Record<string, string>; body?: unknown }): Promise<T>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
type CachedToken = { token: string; expiresAt: number };

// domain|appId-аар: өөр апп эсвэл хостод хуучин token ашиглахгүй.
const tokenCache = new Map<string, CachedToken>();

/** Нууц солигдоход (updateIntegration) шууд хүчинтэй болгох. */
export function clearLarkTokenCache() { tokenCache.clear(); }

type LarkEnvelope = { code?: number; msg?: string; data?: unknown; [key: string]: unknown };

function rateLimitDelayMs(response: Response): number | null {
  const reset = Number(response.headers.get("x-ogw-ratelimit-reset"));
  return Number.isFinite(reset) && reset > 0 ? Math.ceil(reset * 1000) : null;
}

async function readEnvelope(response: Response, what: string): Promise<LarkEnvelope> {
  const raw = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new LarkApiError(`${what}: Lark JSON биш хариу өгсөн (HTTP ${response.status}).`, null, response.status, response.status >= 400 && response.status < 500 && response.status !== 429);
  }
  if (!parsed || typeof parsed !== "object") throw new LarkApiError(`${what}: хоосон хариу.`, null, response.status, false);
  return parsed as LarkEnvelope;
}

function errorFromEnvelope(what: string, envelope: LarkEnvelope, response: Response): LarkApiError {
  const code = typeof envelope.code === "number" ? envelope.code : null;
  // Lark-ийн msg нь техникийн англи текст — admin-д зориулсан тул шууд үлдээнэ,
  // харин урт байвал тасална (lastError 300 тэмдэгт).
  const msg = typeof envelope.msg === "string" ? envelope.msg.slice(0, 200) : "алдаа";
  const rateLimited = response.status === 429 || code === RATE_LIMIT_CODE;
  const permanent = !rateLimited && code !== null && PERMANENT_CODES.has(code);
  return new LarkApiError(`${what}: ${msg}${code !== null ? ` (код ${code})` : ""}`, code, response.status, permanent, rateLimited ? rateLimitDelayMs(response) ?? 60_000 : null);
}

export function createLarkClient(config: LarkConfig, fetchImpl: FetchLike = fetch): LarkClient {
  const cacheKey = `${config.domain}|${config.appId}`;

  async function tenantToken(): Promise<string> {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) return cached.token;
    const response = await fetchImpl(`${config.domain}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const envelope = await readEnvelope(response, "Token");
    const token = typeof envelope.tenant_access_token === "string" ? envelope.tenant_access_token : "";
    if (envelope.code !== 0 || !token) throw errorFromEnvelope("Token", envelope, response);
    const expireSeconds = typeof envelope.expire === "number" && envelope.expire > 0 ? envelope.expire : 7200;
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + expireSeconds * 1000 });
    return token;
  }

  async function call<T>(method: string, path: string, options: { query?: Record<string, string>; body?: unknown } = {}, retried = false): Promise<T> {
    const token = await tenantToken();
    const url = new URL(`${config.domain}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
    const response = await fetchImpl(url.toString(), {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const envelope = await readEnvelope(response, path);
    if (envelope.code === 0) return envelope as T;
    if (!retried && isInvalidTokenResponse(envelope.code, response.status)) {
      tokenCache.delete(cacheKey);
      return call<T>(method, path, options, true);
    }
    throw errorFromEnvelope(path, envelope, response);
  }

  return {
    request: <T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, options?: { query?: Record<string, string>; body?: unknown }) => call<T>(method, path, options),

    async botInfo() {
      const envelope = await call<{ bot?: { app_name?: unknown; open_id?: unknown; activate_status?: unknown } }>("GET", "/open-apis/bot/v3/info");
      const bot = envelope.bot ?? {};
      return {
        name: typeof bot.app_name === "string" ? bot.app_name : "(нэргүй)",
        openId: typeof bot.open_id === "string" ? bot.open_id : null,
        // 2 = идэвхтэй (Lark-ийн баримт: activate_status).
        active: bot.activate_status === 2,
      };
    },

    async listChats() {
      const chats: LarkChat[] = [];
      let pageToken = "";
      for (let page = 0; page < 5; page++) {
        const query: Record<string, string> = { page_size: "100" };
        if (pageToken) query.page_token = pageToken;
        const envelope = await call<{ data?: { items?: { chat_id?: unknown; name?: unknown }[]; has_more?: unknown; page_token?: unknown } }>("GET", "/open-apis/im/v1/chats", { query });
        for (const item of envelope.data?.items ?? []) {
          if (typeof item.chat_id === "string") chats.push({ chatId: item.chat_id, name: typeof item.name === "string" && item.name ? item.name : "(нэргүй чат)" });
        }
        if (envelope.data?.has_more !== true || typeof envelope.data.page_token !== "string") break;
        pageToken = envelope.data.page_token;
      }
      return chats;
    },

    async sendCard(chatId, card, uuid) {
      const body: Record<string, string> = { receive_id: chatId, msg_type: "interactive", content: JSON.stringify(card) };
      if (uuid) body.uuid = uuid.slice(0, 50);
      const envelope = await call<{ data?: { message_id?: unknown } }>("POST", "/open-apis/im/v1/messages", { query: { receive_id_type: "chat_id" }, body });
      return { messageId: typeof envelope.data?.message_id === "string" ? envelope.data.message_id : null };
    },
  };
}

// --- тестэд солих боломжтой нэг цэг ---------------------------------------

let clientOverride: LarkClient | null = null;

/** Тест (FakeLarkClient)-д л. */
export function setLarkClientForTests(client: LarkClient | null) { clientOverride = client; }

export function larkClientFor(config: LarkConfig): LarkClient {
  return clientOverride ?? createLarkClient(config);
}
