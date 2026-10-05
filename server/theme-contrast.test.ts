import { describe, expect, it } from "vitest";
import { BASE_THEME, mergeLook } from "../shared/theme-tokens";
import { checkLookContrast, contrastRatio, fixForeground } from "../shared/color/contrast";

describe("Брэнд студийн AA хамгаалалт", () => {
  it("үндсэн загварын бүх хос AA давна (хадгалах товч анхнаасаа хаагдахгүй)", () => {
    expect(checkLookContrast(BASE_THEME).filter(r => !r.ok)).toEqual([]);
  });

  it("унших боломжгүй хослолыг илрүүлнэ", () => {
    const look = mergeLook(BASE_THEME, { light: { "primary-foreground": "#f5a0a8" } });
    const bad = checkLookContrast(look).filter(r => !r.ok).map(r => r.label);
    expect(bad).toContain("Товчны текст / товч");
  });

  it("харанхуй горимын хос харанхуй утгыг уншина", () => {
    const look = mergeLook(BASE_THEME, { dark: { "ck-muted": "#3a3a3a" } });
    expect(checkLookContrast(look).find(r => r.mode === "dark" && r.fg === "ck-muted" && r.bg === "ck-page")?.ok).toBe(false);
    expect(checkLookContrast(look).find(r => r.mode === "light" && r.fg === "ck-muted" && r.bg === "ck-page")?.ok).toBe(true);
  });

  it("fixForeground — AA хүрэхгүй өнгийг засна, хүрсэнд хүрэхгүй", () => {
    expect(fixForeground("#212121", "#ffffff")).toBe("#212121");
    const fixed = fixForeground("#f5a0a8", "#df1f3d");
    expect(contrastRatio(fixed, "#df1f3d")).toBeGreaterThanOrEqual(4.5);
    const darkened = fixForeground("#9a9a9a", "#ffffff");
    expect(contrastRatio(darkened, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
