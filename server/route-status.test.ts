import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Slug lookups mocked: this is a unit test of the routing decision, not the DB.
vi.mock("./db", () => ({
  getProductBySlug: vi.fn(async (slug: string) => (slug === "real-product" ? { slug } : null)),
  getPublishedRoutineBySlug: vi.fn(async (slug: string) => (slug === "real-routine" ? { slug } : null)),
  getPublishedPostBySlug: vi.fn(async (slug: string) => {
    if (slug === "db-down") throw new Error("connection lost");
    return slug === "real-post" ? { slug } : null;
  }),
}));

import { resolveRouteStatus, STATIC_ROUTES } from "./_core/routeStatus";

describe("resolveRouteStatus (soft-404 fix, 2026-09-21)", () => {
  it("knows every static page App.tsx routes to — the two lists cannot drift", () => {
    const app = readFileSync(path.resolve(import.meta.dirname, "../client/src/App.tsx"), "utf8");
    const routes = [...app.matchAll(/<Route path=\{"([^"]+)"\}/g)].map(match => match[1]);
    expect(routes.length).toBeGreaterThan(10);
    const staticRoutes = routes.filter(route => !route.includes(":") && route !== "/404");
    for (const route of staticRoutes) expect(STATIC_ROUTES.has(route), `App.tsx route ${route} missing from STATIC_ROUTES`).toBe(true);
    for (const route of STATIC_ROUTES) expect(staticRoutes, `STATIC_ROUTES has ${route}, App.tsx does not`).toContain(route);
    // The dynamic routes the resolver understands must still exist in App.tsx.
    for (const dynamic of ["/product/:slug", "/routine/:slug", "/:slug"]) expect(routes).toContain(dynamic);
  });

  it("answers 200 for real pages and 404 for everything else", async () => {
    expect(await resolveRouteStatus("/")).toBe(200);
    expect(await resolveRouteStatus("/privacy")).toBe(200);
    expect(await resolveRouteStatus("/shop?q=cream&page=2")).toBe(200);
    expect(await resolveRouteStatus("/journal/")).toBe(200);
    expect(await resolveRouteStatus("/product/real-product")).toBe(200);
    expect(await resolveRouteStatus("/routine/real-routine")).toBe(200);
    expect(await resolveRouteStatus("/real-post")).toBe(200);

    expect(await resolveRouteStatus("/shopp")).toBe(404);
    expect(await resolveRouteStatus("/product/gone")).toBe(404);
    expect(await resolveRouteStatus("/routine/gone")).toBe(404);
    expect(await resolveRouteStatus("/no/such/page")).toBe(404);
    expect(await resolveRouteStatus("/404")).toBe(404);
  });

  it("never hides a real page when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await resolveRouteStatus("/db-down")).toBe(200);
  });
});
