import { describe, expect, it, vi } from "vitest";
import { protectStateChangingApiRequests } from "./security";

// Audit finding BUG-007 (2026-09-06): protectStateChangingApiRequests used to
// let a POST/PUT/PATCH/DELETE through with zero check whenever the Origin
// header was simply absent. This exercises the Referer fallback + the
// narrower remaining bypass (a request with neither header at all).
function fakeRequest(overrides: { method?: string; path?: string; origin?: string; referer?: string; host?: string; protocol?: string }) {
  const headers: Record<string, string> = {};
  if (overrides.origin) headers.origin = overrides.origin;
  if (overrides.referer) headers.referer = overrides.referer;
  if (overrides.host) headers.host = overrides.host;
  return {
    path: overrides.path ?? "/api/trpc/checkout.createOrder",
    method: overrides.method ?? "POST",
    protocol: overrides.protocol ?? "https",
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Parameters<typeof protectStateChangingApiRequests>[0];
}

function fakeResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Parameters<typeof protectStateChangingApiRequests>[1];
}

describe("protectStateChangingApiRequests", () => {
  it("allows a same-origin request with a matching Origin header", () => {
    const req = fakeRequest({ origin: "https://sugiasayake.mn", host: "sugiasayake.mn" });
    const res = fakeResponse();
    const next = vi.fn();
    protectStateChangingApiRequests(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("blocks a cross-site request with a mismatched Origin header", () => {
    const req = fakeRequest({ origin: "https://evil.example", host: "sugiasayake.mn" });
    const res = fakeResponse();
    const next = vi.fn();
    protectStateChangingApiRequests(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("falls back to a matching Referer when Origin is absent, and allows the request", () => {
    const req = fakeRequest({ referer: "https://sugiasayake.mn/checkout", host: "sugiasayake.mn" });
    const res = fakeResponse();
    const next = vi.fn();
    protectStateChangingApiRequests(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("blocks when Origin is absent but Referer points at a different site", () => {
    const req = fakeRequest({ referer: "https://evil.example/attack-page", host: "sugiasayake.mn" });
    const res = fakeResponse();
    const next = vi.fn();
    protectStateChangingApiRequests(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("still allows the request through when neither Origin nor Referer is present (unchanged, narrower bypass)", () => {
    const req = fakeRequest({ host: "sugiasayake.mn" });
    const res = fakeResponse();
    const next = vi.fn();
    protectStateChangingApiRequests(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("ignores GET requests and requests outside /api/trpc entirely", () => {
    const getReq = fakeRequest({ method: "GET", origin: "https://evil.example", host: "sugiasayake.mn" });
    const getRes = fakeResponse();
    const getNext = vi.fn();
    protectStateChangingApiRequests(getReq, getRes, getNext);
    expect(getNext).toHaveBeenCalledOnce();

    const otherPathReq = fakeRequest({ path: "/health", origin: "https://evil.example", host: "sugiasayake.mn" });
    const otherPathRes = fakeResponse();
    const otherPathNext = vi.fn();
    protectStateChangingApiRequests(otherPathReq, otherPathRes, otherPathNext);
    expect(otherPathNext).toHaveBeenCalledOnce();
  });
});
