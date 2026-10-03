import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateIntegrationSettings } from "../../../shared/integrations";
import { buildOutboxCard, buildTestCard } from "./cards";
import { clearLarkTokenCache, createLarkClient, LarkApiError } from "./client";
import { larkConfigFromSettings, type LarkConfig } from "./config";
import { isLarkPushAllowed, isLarkTestAllowed } from "./gate";

// ---------------------------------------------------------------- gate ----

const PROD = "mysql://u:p@127.0.0.1:3307/defaultdb";
const STAGING = "mysql://u:p@127.0.0.1:3307/sugi_staging";
const KEYS = ["RUN_BACKGROUND_JOBS", "NODE_APP_INSTANCE"] as const;
const original = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));

describe("Lark gate", () => {
  // _test-setup.ts DATABASE_URL-ийг sugi_staging болгодог тул isBackgroundJobRunner()
  // (process.env уншдаг) энд ил тодорхой асаана; cluster-ийн тест өөрөө унтраана.
  beforeEach(() => { process.env.RUN_BACKGROUND_JOBS = "1"; delete process.env.NODE_APP_INSTANCE; });
  afterEach(() => {
    for (const key of KEYS) {
      if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
    }
  });

  it("LARK_PUSH-гүй бол илгээхгүй (лаптоп pnpm dev prod DB руу заасан ч)", () => {
    expect(isLarkPushAllowed({ DATABASE_URL: PROD }).allowed).toBe(false);
  });

  it("production + LARK_PUSH=1 + background runner = илгээнэ", () => {
    expect(isLarkPushAllowed({ DATABASE_URL: PROD, LARK_PUSH: "1" })).toMatchObject({ allowed: true });
  });

  it("staging схем Lark-ийн нууцтай хуулбар ч бодит tenant руу явуулахгүй", () => {
    expect(isLarkPushAllowed({ DATABASE_URL: STAGING, LARK_PUSH: "1" }).allowed).toBe(false);
    expect(isLarkTestAllowed({ DATABASE_URL: STAGING }).allowed).toBe(false);
    // Нэр нь өөрөөр бичигдсэн production схем ч production хэвээр.
    expect(isLarkPushAllowed({ DATABASE_URL: "mysql://u:p@h/%64efaultDB", LARK_PUSH: "1" }).allowed).toBe(true);
  });

  it("тестийн горимд (NOTIFICATIONS_SUPPRESS) хэзээ ч илгээхгүй, тест товч ч", () => {
    expect(isLarkPushAllowed({ DATABASE_URL: PROD, LARK_PUSH: "1", NOTIFICATIONS_SUPPRESS: "1" }).allowed).toBe(false);
    expect(isLarkTestAllowed({ DATABASE_URL: PROD, NOTIFICATIONS_SUPPRESS: "1" }).allowed).toBe(false);
  });

  it("ард ажиллах ажлын эзэн биш процесс (pm2 worker, RUN_BACKGROUND_JOBS=0) илгээхгүй", () => {
    process.env.RUN_BACKGROUND_JOBS = "0";
    expect(isLarkPushAllowed({ DATABASE_URL: PROD, LARK_PUSH: "1" }).allowed).toBe(false);
  });

  it("задлагдахгүй URL дээр хаалттай (fail closed)", () => {
    expect(isLarkTestAllowed({ DATABASE_URL: "not a url" }).allowed).toBe(false);
    expect(isLarkTestAllowed({}).allowed).toBe(false);
  });

  it("LARK_ALLOW_NON_PRODUCTION — ухамсартай sandbox tenant", () => {
    expect(isLarkPushAllowed({ DATABASE_URL: STAGING, LARK_PUSH: "1", LARK_ALLOW_NON_PRODUCTION: "1" }).allowed).toBe(true);
  });
});

// -------------------------------------------------------------- config ----

describe("larkConfigFromSettings", () => {
  it("App ID/нууцгүй бол null", () => {
    expect(larkConfigFromSettings({ appId: "cli_abcdef12" })).toBeNull();
  });

  it("зөвшөөрөгдөөгүй хост хадгалагдсан байсан ч нууцыг тийш явуулахгүй", () => {
    const config = larkConfigFromSettings({ appId: "cli_abcdef12", appSecret: "s", domain: "https://evil.example.com" });
    expect(config?.domain).toBe("https://open.larksuite.com");
  });

  it("бүлэг тус бүрийн чат ба унтраасан event", () => {
    const config = larkConfigFromSettings({ appId: "cli_abcdef12", appSecret: "s", domain: "https://open.feishu.cn/", chatWarehouse: "oc_abc123456", disabledEvents: "stock.low, order.paid" });
    expect(config?.domain).toBe("https://open.feishu.cn");
    expect(config?.chats).toEqual({ warehouse: "oc_abc123456" });
    expect([...config!.disabledEvents]).toEqual(["stock.low", "order.paid"]);
  });
});

describe("validateIntegrationSettings (lark)", () => {
  it("хост, апп ID, чатын ID-г шалгана", () => {
    expect(validateIntegrationSettings("lark", { domain: "https://open.larksuite.com" })).toBeNull();
    expect(validateIntegrationSettings("lark", { domain: "https://attacker.example" })).toMatch(/зөвхөн/);
    expect(validateIntegrationSettings("lark", { appId: "cli_aa35cee5dc38de17" })).toBeNull();
    expect(validateIntegrationSettings("lark", { appId: "aa35cee5" })).toMatch(/cli_/);
    expect(validateIntegrationSettings("lark", { chatStore: "oc_1234567890abcdef" })).toBeNull();
    expect(validateIntegrationSettings("lark", { chatStore: "https://x" })).toMatch(/oc_/);
    expect(validateIntegrationSettings("lark", { unknownKey: "x" })).toMatch(/байхгүй/);
  });
});

// --------------------------------------------------------------- cards ----

describe("buildOutboxCard", () => {
  it("зөвхөн гарчиг, мессеж, холбоос — нэмэлт талбар гардаггүй, plain_text", () => {
    const card = buildOutboxCard({ title: "Шинэ захиалга", message: "#123 · 45,000₮ <at id=all></at>", clickPath: "/admin?adminSection=orders", priority: 4 }, "https://sugi.example.mn");
    const json = JSON.stringify(card);
    expect(json).toContain("plain_text");
    expect(json).not.toContain("lark_md");
    expect(json).toContain("https://sugi.example.mn/admin?adminSection=orders");
    expect(card).toMatchObject({ header: { template: "orange" } });
  });

  it("PUBLIC_BASE_URL-гүй эсвэл гадаад холбоостой бол товчгүй", () => {
    expect(JSON.stringify(buildOutboxCard({ title: "t", message: "m", clickPath: "/admin", priority: 5 }, ""))).not.toContain("button");
    expect(JSON.stringify(buildOutboxCard({ title: "t", message: "m", clickPath: "https://evil", priority: 5 }, "https://sugi.example.mn"))).not.toContain("button");
  });

  it("туршилтын карт бүлгийн нэртэй", () => {
    expect(JSON.stringify(buildTestCard("Агуулах", "https://sugi.example.mn"))).toContain("Агуулах");
  });
});

// -------------------------------------------------------------- client ----

const CONFIG: LarkConfig = { appId: "cli_test1234", appSecret: "secret", domain: "https://open.larksuite.com", chats: {}, disabledEvents: new Set() };

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: Array<{ status?: number; body: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = [];
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected call ${url}`);
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "content-type": "application/json", ...next.headers } });
  };
  return { calls, impl };
}

const TOKEN_OK = { body: { code: 0, msg: "ok", tenant_access_token: "t-1", expire: 7200 } };

describe("createLarkClient", () => {
  beforeEach(() => clearLarkTokenCache());

  it("token-ийг кэшлэж, картыг chat_id + uuid-тай илгээнэ", async () => {
    const { calls, impl } = fakeFetch([TOKEN_OK, { body: { code: 0, data: { message_id: "om_1" } } }, { body: { code: 0, data: { message_id: "om_2" } } }]);
    const client = createLarkClient(CONFIG, impl);
    expect(await client.sendCard("oc_x", { a: 1 }, "sugi-outbox-9")).toEqual({ messageId: "om_1" });
    await client.sendCard("oc_x", { a: 2 });
    expect(calls).toHaveLength(3); // token нэг л удаа
    expect(calls[0].url).toBe("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal");
    expect(calls[1].url).toBe("https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id");
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe("Bearer t-1");
    const body = JSON.parse(String(calls[1].init.body));
    expect(body).toMatchObject({ receive_id: "oc_x", msg_type: "interactive", uuid: "sugi-outbox-9" });
    expect(JSON.parse(body.content)).toEqual({ a: 1 });
  });

  it("хүчингүй token-ийн кодод кэшийг цэвэрлээд нэг удаа дахин оролдоно", async () => {
    const { calls, impl } = fakeFetch([TOKEN_OK, { body: { code: 99991663, msg: "invalid token" } }, { body: { code: 0, tenant_access_token: "t-2", expire: 7200 } }, { body: { code: 0, data: { message_id: "om_3" } } }]);
    const client = createLarkClient(CONFIG, impl);
    expect(await client.sendCard("oc_x", {})).toEqual({ messageId: "om_3" });
    expect((calls[3].init.headers as Record<string, string>).authorization).toBe("Bearer t-2");
  });

  it("бот чатад байхгүй (230002) = байнгын алдаа; 429 = хүлээх хугацаатай", async () => {
    const permanent = fakeFetch([TOKEN_OK, { status: 400, body: { code: 230002, msg: "Bot is not in the chat" } }]);
    const error = await createLarkClient(CONFIG, permanent.impl).sendCard("oc_x", {}).catch(e => e);
    expect(error).toBeInstanceOf(LarkApiError);
    expect(error).toMatchObject({ code: 230002, permanent: true });

    clearLarkTokenCache();
    const limited = fakeFetch([TOKEN_OK, { status: 429, body: { code: 99991400, msg: "rate limited" }, headers: { "x-ogw-ratelimit-reset": "7" } }]);
    const rateError = await createLarkClient(CONFIG, limited.impl).sendCard("oc_x", {}).catch(e => e);
    expect(rateError).toMatchObject({ permanent: false, retryAfterMs: 7000 });
  });

  it("буруу нууц token шатанд байнгын алдаа", async () => {
    const { impl } = fakeFetch([{ status: 400, body: { code: 10014, msg: "app secret invalid" } }]);
    await expect(createLarkClient(CONFIG, impl).botInfo()).rejects.toMatchObject({ code: 10014, permanent: true });
  });

  it("чатуудыг хуудаслан уншина", async () => {
    const { calls, impl } = fakeFetch([
      TOKEN_OK,
      { body: { code: 0, data: { items: [{ chat_id: "oc_a", name: "Агуулах" }], has_more: true, page_token: "p2" } } },
      { body: { code: 0, data: { items: [{ chat_id: "oc_b", name: "" }], has_more: false } } },
    ]);
    expect(await createLarkClient(CONFIG, impl).listChats()).toEqual([{ chatId: "oc_a", name: "Агуулах" }, { chatId: "oc_b", name: "(нэргүй чат)" }]);
    expect(calls[2].url).toContain("page_token=p2");
  });
});
