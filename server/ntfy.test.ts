import { afterEach, describe, expect, it, vi } from "vitest";
import { publishNtfy, truncateUtf8 } from "./_core/ntfy";

// server/_core/ntfy.ts against a stubbed fetch -- the exact request ntfy.sh
// receives, and the "never throws" contract the dispatcher relies on.
const okResponse = () => new Response(JSON.stringify({ id: "abc", event: "message" }), { status: 200 });

describe("publishNtfy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs JSON to the server root with the topic in the body (Cyrillic-safe)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const result = await publishNtfy({}, { topic: "sugi-warehouse-abcdefghijklmnop", title: "Шинэ захиалга SG-1", message: "12,000₮ · 2 ширхэг", priority: 4, tags: ["package"], click: "https://example.mn/admin?adminSection=orders" });
    expect(result).toEqual({ ok: true, status: 200, error: null, retryAfterMs: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ntfy.sh");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ topic: "sugi-warehouse-abcdefghijklmnop", title: "Шинэ захиалга SG-1", message: "12,000₮ · 2 ширхэг", priority: 4, tags: ["package"], click: "https://example.mn/admin?adminSection=orders" });
  });

  it("uses a custom server and bearer token when configured", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await publishNtfy({ serverUrl: "https://push.example.mn/", accessToken: " tk_secret " }, { topic: "t", title: "a", message: "b" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://push.example.mn");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tk_secret");
  });

  it("reports a rejected request with its status and Retry-After, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429, headers: { "Retry-After": "30" } })));
    const result = await publishNtfy({}, { topic: "t", title: "a", message: "b" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
    expect(result.retryAfterMs).toBe(30_000);
    expect(result.error).toContain("429");
  });

  it("turns a network failure or timeout into a result, never an exception", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); }));
    const timedOut = await publishNtfy({}, { topic: "t", title: "a", message: "b" });
    expect(timedOut).toMatchObject({ ok: false, status: null });
    expect(timedOut.error).toContain("timed out");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const offline = await publishNtfy({}, { topic: "t", title: "a", message: "b" });
    expect(offline).toMatchObject({ ok: false, status: null });
    expect(offline.error).toContain("fetch failed");
  });

  it("keeps long messages under ntfy's 4 KB attachment threshold", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await publishNtfy({}, { topic: "t", title: "a", message: "Ө".repeat(5000) });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(new TextEncoder().encode(body.message).length).toBeLessThanOrEqual(3800);
    expect(body.message.endsWith("…")).toBe(true);
  });
});

describe("truncateUtf8", () => {
  it("never splits a multi-byte character", () => {
    const cut = truncateUtf8("ӨӨӨӨӨ", 7); // each Ө is 2 bytes, … is 3
    expect(cut).toBe("ӨӨ…");
    expect(truncateUtf8("short", 100)).toBe("short");
  });
});
