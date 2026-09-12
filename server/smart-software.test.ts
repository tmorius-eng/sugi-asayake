import { beforeEach, describe, expect, it } from "vitest";
import { clearSmartSoftwareTokenCache, SmartSoftwareProvider, type SmartTransportRequest, type SmartTransportResponse } from "./integrations/smartSoftware";

/**
 * The Smart Software adapter against a stubbed transport: the exact request
 * their server receives, and how their documented responses are read. No
 * network, no credentials -- see server/integrations/smartSoftware.ts for
 * which documented endpoint each case comes from.
 */
const credentials = { username: "sugi_api", password: "s3cret" };

function stub(handler: (request: SmartTransportRequest) => SmartTransportResponse) {
  const calls: SmartTransportRequest[] = [];
  const transport = async (request: SmartTransportRequest) => { calls.push(request); return handler(request); };
  return { calls, transport };
}

const tokenBody = JSON.stringify({ access_token: "tok-123", token_type: "bearer", expires_in: 3600 });

describe("SmartSoftwareProvider", () => {
  beforeEach(() => clearSmartSoftwareTokenCache());

  it("asks for a token with the OAuth2 password grant, form-encoded", async () => {
    const { calls, transport } = stub(() => ({ status: 200, body: tokenBody }));
    const provider = new SmartSoftwareProvider(credentials, transport);
    await expect(provider.token("https://retailapiv2.smartlogic.mn")).resolves.toBe("tok-123");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://retailapiv2.smartlogic.mn/oauth/token");
    expect(calls[0].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(calls[0].body))).toEqual({ username: "sugi_api", password: "s3cret", grant_type: "password" });
  });

  it("falls back to the documented GET-with-body when POST is refused", async () => {
    const { calls, transport } = stub(request => request.method === "POST" ? { status: 405, body: "Method Not Allowed" } : { status: 200, body: tokenBody });
    const provider = new SmartSoftwareProvider(credentials, transport);
    await expect(provider.token("https://smartposapi.smartapp.mn")).resolves.toBe("tok-123");
    expect(calls.map(call => call.method)).toEqual(["POST", "GET"]);
    expect(calls[1].body).toContain("grant_type=password");
  });

  it("reuses a cached token until it nears expiry, then asks again", async () => {
    let now = 1_000_000;
    const { calls, transport } = stub(() => ({ status: 200, body: JSON.stringify({ access_token: `tok-${calls.length}`, expires_in: 120 }) }));
    const provider = new SmartSoftwareProvider(credentials, transport, () => now);
    await provider.token("https://host.example");
    await provider.token("https://host.example");
    expect(calls).toHaveLength(1); // second call served from cache
    now += 61_000; // past (120s - 60s margin)
    await provider.token("https://host.example");
    expect(calls).toHaveLength(2);
  });

  it("reports a wrong username or password instead of throwing a raw error", async () => {
    const { transport } = stub(() => ({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) }));
    const provider = new SmartSoftwareProvider(credentials, transport);
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("400");
    expect(result.detail).toContain("invalid_grant");
  });

  it("refuses to call anything without credentials", async () => {
    const { calls, transport } = stub(() => ({ status: 200, body: tokenBody }));
    const provider = new SmartSoftwareProvider({}, transport);
    expect(provider.hasCredentials).toBe(false);
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("reads the location list, sending the token as a bearer header", async () => {
    const { calls, transport } = stub(request => request.url.endsWith("/oauth/token")
      ? { status: 200, body: tokenBody }
      : { status: 200, body: JSON.stringify([{ id: "102", name: "Саруул Зах Салбар" }, { id: 112, name: "  " }]) });
    const provider = new SmartSoftwareProvider(credentials, transport);
    await expect(provider.listLocations()).resolves.toEqual([{ id: "102", name: "Саруул Зах Салбар" }, { id: "112", name: "112" }]);
    const listCall = calls[1];
    expect(listCall.url).toBe("https://retailapiv2.smartlogic.mn/api/inventory/stock_locations");
    expect(listCall.headers.Authorization).toBe("Bearer tok-123");
  });

  it("turns the product list into stock per location, keyed by barcode", async () => {
    const products = [
      { id: "10021", name: "Light Red Wine", barcode: "8000040002509", price: 4500, stock_locations: [{ location_id: "112", count_on_hand: 48 }, { location_id: "102", count_on_hand: 2 }] },
      { id: "10020", name: "Budwiser 0.33L", barcode: "8656002891171", price: 1500, stock_locations: [{ location_id: "112", count_on_hand: -3 }] },
      { id: "10019", name: "No barcode", barcode: "", stock_locations: [{ location_id: "112", count_on_hand: 5 }] },
    ];
    const { transport } = stub(request => request.url.endsWith("/oauth/token") ? { status: 200, body: tokenBody } : { status: 200, body: JSON.stringify(products) });
    const provider = new SmartSoftwareProvider(credentials, transport);
    const snapshot = await provider.pullStockSnapshot();
    // A product with no barcode cannot be matched to our catalogue at all.
    expect(snapshot.products).toEqual([
      { sku: "8000040002509", name: "Light Red Wine", stock: { "112": 48, "102": 2 } },
      { sku: "8656002891171", name: "Budwiser 0.33L", stock: { "112": -3 } },
    ]);
    expect(snapshot.locationIds.sort()).toEqual(["102", "112"]);
  });

  it("does not mistake an HTML error page for data", async () => {
    const { transport } = stub(request => request.url.endsWith("/oauth/token") ? { status: 200, body: tokenBody } : { status: 200, body: "<html>Service unavailable</html>" });
    const provider = new SmartSoftwareProvider(credentials, transport);
    await expect(provider.pullStockSnapshot()).rejects.toThrow(/JSON биш/);
  });

  it("drops a token the vendor rejects, so the next call fetches a fresh one", async () => {
    let unauthorized = true;
    const { calls, transport } = stub(request => {
      if (request.url.endsWith("/oauth/token")) return { status: 200, body: tokenBody };
      if (unauthorized) { unauthorized = false; return { status: 401, body: "expired" }; }
      return { status: 200, body: "[]" };
    });
    const provider = new SmartSoftwareProvider(credentials, transport);
    await expect(provider.listLocations()).rejects.toThrow(/401/);
    await expect(provider.listLocations()).resolves.toEqual([]);
    expect(calls.filter(call => call.url.endsWith("/oauth/token"))).toHaveLength(2);
  });

  it("uses the configured hosts, trimming a trailing slash", async () => {
    const { calls, transport } = stub(request => request.url.endsWith("/oauth/token") ? { status: 200, body: tokenBody } : { status: 200, body: "[]" });
    const provider = new SmartSoftwareProvider({ ...credentials, inventoryBaseUrl: "https://stock.example.mn/", posBaseUrl: "https://pos.example.mn/" }, transport);
    expect(provider.posBaseUrl).toBe("https://pos.example.mn");
    await provider.listLocations();
    expect(calls[1].url).toBe("https://stock.example.mn/api/inventory/stock_locations");
  });

  it("turns a network failure into a readable message, not a stack trace", async () => {
    const transport = async () => { throw Object.assign(new Error("getaddrinfo ENOTFOUND retailapiv2.smartlogic.mn"), { code: "ENOTFOUND" }); };
    const provider = new SmartSoftwareProvider(credentials, transport);
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("ENOTFOUND");
    expect(result.detail).toContain("/oauth/token");
  });
});
