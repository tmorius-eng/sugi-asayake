import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_FONTS, FONT_SUBSETS, fontFaceCss, fontStack } from "../shared/fonts";
import { BASE_THEME, mergeLook, sanitizeLookPatch } from "../shared/theme-tokens";
import { renderBrandTokensStyle } from "./_core/themeCss";

// Брэнд студийн фонт (A2, 2026-10-05): файл бүр бий, лиценз бүртгэгдсэн, зөвхөн сонгосон фонт татагдана.
const fontsDir = join(__dirname, "..", "client", "public", "fonts");

describe("брэнд фонт", () => {
  it.each(BRAND_FONTS.filter(f => f.key !== "golos").map(f => [f.key, f.family] as const))("%s — 4 subset файл, OFL.txt-д бүртгэлтэй", (key, family) => {
    for (const subset of Object.keys(FONT_SUBSETS)) expect(existsSync(join(fontsDir, key, `${subset}.woff2`)), `${key}/${subset}`).toBe(true);
    expect(readFileSync(join(fontsDir, "OFL.txt"), "utf8")).toContain(`${family} (${key}/`);
  });

  it("Golos (анхдагч) — @font-face, хувьсагч нэмэхгүй (index.css-тэй ижил, харагдах өөрчлөлт 0)", () => {
    expect(fontFaceCss("golos")).toBe("");
    const style = renderBrandTokensStyle(BASE_THEME);
    expect(style).not.toContain("@font-face");
    expect(style).not.toContain("--font-body");
  });

  it("сонгосон фонт л: @font-face 4 subset, stack-тай хувьсагч", () => {
    const look = mergeLook(BASE_THEME, { fontBody: "inter", fontDisplay: "montserrat" });
    const style = renderBrandTokensStyle(look);
    expect(style.match(/@font-face/g)).toHaveLength(8);
    expect(style).toContain(`--font-body:${fontStack("inter")};`);
    expect(style).toContain(`--font-display:${fontStack("montserrat")};`);
    expect(style).not.toContain("/fonts/nunito/");
  });

  it("үл мэдэх фонтын түлхүүрийг хаяна", () => {
    expect(sanitizeLookPatch({ fontBody: "comic-sans", fontDisplay: "inter" })).toEqual({ fontDisplay: "inter" });
    expect(mergeLook(BASE_THEME, { fontBody: "<script>" }).fontBody).toBe("golos");
  });
});
