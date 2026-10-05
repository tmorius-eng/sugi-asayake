import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASE_THEME, DARK_TOKEN_KEYS, LIGHT_TOKEN_KEYS, mergeLook, normalizeHex, sanitizeLookPatch } from "../shared/theme-tokens";
import { renderBrandTokensStyle } from "./_core/themeCss";
import { contrastRatio } from "../shared/color/contrast";

// Брэнд студи (2026-10-05): кодын BASE_THEME нь index.css-ийн утгатай ЯГ тэнцүү байх ёстой —
// эс бөгөөс серверийн `<style id="brand-tokens">` сайтыг чимээгүй өөр өнгөтэй болгоно.
const css = readFileSync("client/src/index.css", "utf8");
const block = (selector: RegExp) => {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(selector)) {
    for (const d of m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
};
const rootVars = block(/(?:^|\n):root\s*\{([^}]*)\}/g);
const darkVars = block(/\nhtml\[data-storefront-theme="dark"\]\s*\{([^}]*)\}/g);

describe("BASE_THEME ↔ index.css", () => {
  it("гэрэл горимын токен бүр index.css :root-тэй тэнцүү", () => {
    for (const key of LIGHT_TOKEN_KEYS) expect([key, normalizeHex(rootVars[key])]).toEqual([key, BASE_THEME.light[key]]);
  });
  it("харанхуй горимын токен бүр index.css-ийн dark блоктой тэнцүү", () => {
    for (const key of DARK_TOKEN_KEYS) expect([key, normalizeHex(darkVars[key])]).toEqual([key, BASE_THEME.dark[key]]);
  });
  it("radius ба зургийн харьцаа index.css-тэй ижил", () => {
    expect(rootVars.radius).toBe("0.9rem");
    expect(rootVars["product-aspect"]).toBe("1 / 1");
  });
});

describe("renderBrandTokensStyle", () => {
  it("html:root ба dark селектортой, бүх токентой", () => {
    const style = renderBrandTokensStyle(BASE_THEME);
    expect(style.startsWith('<style id="brand-tokens">html:root{')).toBe(true);
    expect(style).toContain('html:root[data-storefront-theme="dark"]{--ck-page:#131313;');
    expect(style).toContain("--primary:#df1f3d;");
    expect(style).toContain("--radius:0.9rem;");
    expect(style).toContain("--product-aspect:1 / 1;");
  });
  it("буруу утга CSS-ээс гарч чадахгүй (injection)", () => {
    const evil = mergeLook(BASE_THEME, { light: { primary: "red;}body{display:none" } });
    expect(evil.light.primary).toBe("#df1f3d");
    const forced = { ...BASE_THEME, light: { ...BASE_THEME.light, primary: "#fff;}</style><script>" } };
    expect(renderBrandTokensStyle(forced)).not.toContain("<script>");
  });
});

describe("sanitizeLookPatch / mergeLook", () => {
  it("зөвхөн мэдэгдэх түлхүүр, зөв hex үлдэнэ; 3 оронтой hex өргөжнө", () => {
    expect(sanitizeLookPatch({ light: { primary: "#ABC", bogus: "#000000", accent: "nope" }, radius: "xl", productAspect: "4/5", extra: 1 }))
      .toEqual({ light: { primary: "#aabbcc" }, radius: "xl", productAspect: "4/5" });
  });
  it("хэсэгчилсэн өөрчлөлт суурийн үлдсэнийг хадгална", () => {
    const look = mergeLook(BASE_THEME, { light: { primary: "#0055aa" } });
    expect(look.light.primary).toBe("#0055aa");
    expect(look.light.background).toBe(BASE_THEME.light.background);
    expect(look.dark).toEqual(BASE_THEME.dark);
  });
});

describe("contrastRatio (e2e-ийн томьёо)", () => {
  it("мэдэгдэх хосууд", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#df1f3d")).toBeCloseTo(4.77, 1);
    expect(contrastRatio("#fffaf5", "#b01729")).toBeGreaterThan(4.5);
  });
});
