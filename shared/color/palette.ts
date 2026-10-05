import { BASE_THEME, type ThemeTokens } from "../theme-tokens";
import { contrastRatio, fixForeground, hexToRgb } from "./contrast";

/**
 * Лого → палитр (Брэнд студи A2, 2026-10-05). Логоны пикселээс median-cut-аар гол өнгөнүүдийг
 * гаргаж, брэндийн өнгө (хамгийн ханасан, хангалттай харанхуй) сонгоод "Тод / Зөөлөн / Харанхуй
 * зурвас" гурван палитр санал болгоно. Палитр бүр AA (4.5:1)-д автоматаар засагдсан — админ шууд
 * хадгалж болно. Хамааралгүй, цэвэр функц (sharp-ийн raw RGB-г сервер өгнө).
 */
export type Rgb = [number, number, number];

const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const hsl = (hex: string) => { const { r, g, b } = hexToRgb(hex); return rgbToHsl([r, g, b]); };
const fromHsl = (h: number, s: number, l: number) => toHex(hslToRgb([((h % 360) + 360) % 360, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l))]));

/** Median-cut: хамгийн өргөн сувгаар хуваасаар `count` бүлэг; бүлэг бүрийн дундаж ба жин. */
export function quantize(pixels: Rgb[], count = 6): Array<{ hex: string; weight: number }> {
  if (!pixels.length) return [];
  let boxes: Rgb[][] = [pixels];
  while (boxes.length < count) {
    let index = -1, bestRange = 0, channel = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of box) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
        if (hi - lo > bestRange) { bestRange = hi - lo; index = i; channel = c; }
      }
    });
    if (index < 0 || bestRange < 8) break;
    const box = boxes[index].slice().sort((a, b) => a[channel] - b[channel]);
    const mid = box.length >> 1;
    boxes = [...boxes.slice(0, index), box.slice(0, mid), box.slice(mid), ...boxes.slice(index + 1)];
  }
  return boxes
    .map(box => {
      const sum = box.reduce<Rgb>((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
      return { hex: toHex([sum[0] / box.length, sum[1] / box.length, sum[2] / box.length]), weight: box.length / pixels.length };
    })
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Брэндийн өнгө: цагаан/хар/саарал дэвсгэрийг алгасаж, ханалт × жин хамгийн их. Логон дээр
 * ханасан өнгө огт байхгүй (хар-цагаан лого) бол null — тэр үед үндсэн палитр хэвээр.
 */
export function pickBrandColor(swatches: Array<{ hex: string; weight: number }>): string | null {
  const scored = swatches
    .map(s => { const [, sat, light] = hsl(s.hex); return { ...s, score: sat > 0.25 && light > 0.12 && light < 0.85 ? sat * Math.sqrt(s.weight) : 0 }; })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.hex ?? null;
}

export interface DerivedPalette { key: "vivid" | "soft" | "deep"; name: string; light: Partial<ThemeTokens> }

/** Брэнд өнгөөс 3 палитр. Бүх текстийн хос AA-д засагдана (fixForeground). */
export function derivePalettes(brandHex: string): DerivedPalette[] {
  const [h, s] = hsl(brandHex);
  const sat = Math.max(0.45, Math.min(0.9, s));
  const make = (key: DerivedPalette["key"], name: string, primaryL: number, opts: { bg: [number, number]; card: [number, number]; promo: [number, number] }): DerivedPalette => {
    // Товч: дунд гэрэлтэй өнгөнд (шар, ногоон) хар ч цагаан ч 4.5-д хүрдэггүй — тэгвэл товчийг
    // өөрийг нь цагаан текст AA давтал харанхуйлна. Hover нь текстээсээ холдох чиглэлд.
    let lightness = primaryL;
    let primary = fromHsl(h, sat, lightness);
    while (contrastRatio("#ffffff", primary) < 4.5 && contrastRatio("#17181b", primary) < 4.5 && lightness > 0.1) {
      lightness -= 0.02;
      primary = fromHsl(h, sat, lightness);
    }
    const background = fromHsl(h, opts.bg[0], opts.bg[1]);
    const card = fromHsl(h, opts.card[0], opts.card[1]);
    const promoBg = fromHsl(h, opts.promo[0], opts.promo[1]);
    // Товч дээрх текст: цагаан эсвэл хар аль нь илүү уншигдахаар, дараа нь AA хүртэл засна.
    const onPrimary = contrastRatio("#ffffff", primary) >= contrastRatio("#17181b", primary) ? "#ffffff" : "#17181b";
    const primaryHover = fromHsl(h, sat, onPrimary === "#ffffff" ? lightness - 0.07 : lightness + 0.07);
    const light: Partial<ThemeTokens> = {
      primary,
      "primary-hover": primaryHover,
      "primary-foreground": fixForeground(fixForeground(onPrimary, primary), primaryHover),
      "primary-text": fixForeground(fixForeground(primary, background), card),
      destructive: primary,
      "destructive-foreground": fixForeground(onPrimary, primary),
      background,
      card,
      popover: card,
      secondary: fromHsl(h, opts.bg[0], opts.bg[1] - 0.04),
      muted: fromHsl(h, opts.card[0], opts.card[1] - 0.03),
      "surface-tint": fromHsl(h, opts.bg[0], opts.bg[1] - 0.02),
      border: fromHsl(h, opts.bg[0] * 0.8, opts.bg[1] - 0.14),
      input: fromHsl(h, opts.bg[0] * 0.8, opts.bg[1] - 0.14),
      ring: fixForeground(primary, background),
      sky: fixForeground(primary, background),
      "muted-foreground": fixForeground(fixForeground(fromHsl(h, 0.06, 0.36), background), card),
      "promo-bar-bg": promoBg,
      "promo-bar-fg": fixForeground("#ffffff", promoBg),
    };
    return { key, name, light };
  };
  return [
    make("vivid", "Тод", 0.45, { bg: [0.12, 0.95], card: [0.1, 0.985], promo: [0.35, 0.14] }),
    make("soft", "Зөөлөн", 0.52, { bg: [0.18, 0.9], card: [0.14, 0.965], promo: [0.25, 0.22] }),
    make("deep", "Харанхуй зурвас", 0.38, { bg: [0.06, 0.93], card: [0.04, 0.99], promo: [sat, 0.24] }),
  ];
}

export const PALETTE_BASE = BASE_THEME;
