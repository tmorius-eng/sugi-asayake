import { describe, expect, it } from "vitest";
import { renderRobots, renderSitemap, STATIC_ROUTES } from "./_core/sitemap";

describe("renderSitemap", () => {
  it("emits absolute URLs, escapes XML, and formats lastmod as a date", () => {
    const xml = renderSitemap("https://sugi.karkaron.com/", [
      { path: "/", priority: "1.0" },
      { path: "/shop?category=%D0%A5%D2%AF%D0%BD%D1%81", changefreq: "daily" },
      { path: "/product/s-select-hatomugi-face-wash-036833", lastmod: new Date("2026-09-13T04:05:06Z") },
      { path: "/post?a=1&b=2" },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<loc>https://sugi.karkaron.com/</loc>");
    expect(xml).toContain("<loc>https://sugi.karkaron.com/shop?category=%D0%A5%D2%AF%D0%BD%D1%81</loc>");
    expect(xml).toContain("<lastmod>2026-09-13</lastmod>");
    expect(xml).toContain("<loc>https://sugi.karkaron.com/post?a=1&amp;b=2</loc>");
    expect(xml).not.toContain("&b=2</loc>");
    expect(xml.match(/<url>/g)).toHaveLength(4);
  });

  it("does not double the slash when the origin has none", () => {
    expect(renderSitemap("https://sugiasayake.mn", [{ path: "/shop" }])).toContain("<loc>https://sugiasayake.mn/shop</loc>");
  });

  it("static routes include the storefront's public pages and nothing private", () => {
    const paths = STATIC_ROUTES.map(r => r.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/shop");
    expect(paths).not.toContain("/admin");
    expect(paths).not.toContain("/checkout");
    expect(paths).not.toContain("/profile");
  });
});

describe("renderRobots", () => {
  it("points at this site's own sitemap, not the retired preview host", () => {
    const robots = renderRobots("https://sugi.karkaron.com");
    expect(robots).toContain("Sitemap: https://sugi.karkaron.com/sitemap.xml");
    expect(robots).not.toContain("manus.space");
  });

  it("keeps crawlers out of the panel, the API and account pages", () => {
    const robots = renderRobots("https://x.mn");
    for (const path of ["/admin", "/api/", "/checkout", "/orders", "/profile", "/login"]) {
      expect(robots).toContain(`Disallow: ${path}`);
    }
    expect(robots).toContain("Allow: /");
  });
});
