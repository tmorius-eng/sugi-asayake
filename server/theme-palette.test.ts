import { describe, expect, it } from "vitest";
import { derivePalettes, pickBrandColor, quantize, rgbToHsl, hslToRgb, type Rgb } from "../shared/color/palette";
import { checkLookContrast } from "../shared/color/contrast";
import { BASE_THEME, mergeLook } from "../shared/theme-tokens";

const fill = (rgb: Rgb, n: number): Rgb[] => Array.from({ length: n }, () => rgb);

describe("лого → палитр", () => {
  it("HSL ↔ RGB буцаж тэнцүү", () => {
    for (const rgb of [[223, 31, 61], [29, 78, 158], [18, 53, 91], [240, 181, 45]] as Rgb[]) {
      const back = hslToRgb(rgbToHsl(rgb)).map(Math.round);
      back.forEach((v, i) => expect(Math.abs(v - rgb[i])).toBeLessThanOrEqual(1));
    }
  });

  it("цагаан дэвсгэртэй улаан логоноос улааныг брэнд өнгө болгоно", () => {
    const pixels = [...fill([255, 255, 255], 700), ...fill([223, 31, 61], 200), ...fill([20, 20, 20], 100)];
    const swatches = quantize(pixels, 6);
    const brand = pickBrandColor(swatches)!;
    const [h, s] = rgbToHsl([parseInt(brand.slice(1, 3), 16), parseInt(brand.slice(3, 5), 16), parseInt(brand.slice(5, 7), 16)]);
    expect(h < 15 || h > 340).toBe(true);
    expect(s).toBeGreaterThan(0.5);
  });

  it("хар-цагаан логод брэнд өнгө байхгүй (null)", () => {
    expect(pickBrandColor(quantize([...fill([255, 255, 255], 500), ...fill([10, 10, 10], 500)], 4))).toBeNull();
  });

  it.each(["#df1f3d", "#1d4e9e", "#f0b52d", "#2f9e44", "#7b2cbf", "#ffe14d", "#00a7b5"])("%s — 3 палитр бүгд AA давна", brand => {
    const palettes = derivePalettes(brand);
    expect(palettes.map(p => p.key)).toEqual(["vivid", "soft", "deep"]);
    for (const palette of palettes) {
      const failing = checkLookContrast(mergeLook(BASE_THEME, { light: palette.light })).filter(r => !r.ok && r.mode === "light").map(r => `${palette.key}: ${r.label} ${r.ratio}`);
      expect(failing).toEqual([]);
    }
  });
});
