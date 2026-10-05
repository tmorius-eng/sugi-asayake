import type { ThemeTokens } from "./theme-tokens";

/**
 * Баяр бүрийн САНАЛ БОЛГОХ өнгө (2026-10-05). Анхдагчаар ХЭРЭГЖИХГҮЙ — Брэнд студийн "Баярын
 * загвар" табд "Санал болгох өнгийг ашиглах" дарж л тухайн баярын загварт хуулагдана, дараа нь
 * админ засна. Өнгө бол эзний шийдвэр (PROJECT-GUIDE дүрэм 0.1), энэ нь зөвхөн эхлэл.
 *
 * Бүгд үндсэн загвар дээр давхарлахад AA давна — server/holiday-palettes.test.ts.
 */
export type HolidayPalette = Partial<ThemeTokens>;

const brand = (primary: string, hover: string, text: string, accent: string, promoBg: string, gold = "#7a6318"): HolidayPalette => ({
  primary, "primary-hover": hover, "primary-text": text, destructive: primary, ring: text, sky: text,
  accent, "ck-gold": gold, "promo-bar-bg": promoBg, "promo-bar-fg": "#ffffff",
});

export const HOLIDAY_PALETTES: Record<string, { palette: HolidayPalette; mood: string }> = {
  "new-year": { palette: brand("#1f6b4f", "#185a42", "#185a42", "#d9ab3c", "#0f3d2e"), mood: "Гацуурын ногоон, алтлаг гялбаа" },
  "tsagaan-sar": { palette: brand("#1d4e9e", "#173f80", "#1d4e9e", "#e0b04a", "#13305f"), mood: "Хадагны цэнхэр, ул боовны алт" },
  valentine: { palette: brand("#c2185b", "#a3134c", "#a3134c", "#f7b9cb", "#5c0b2a"), mood: "Сарнайн ягаан" },
  "womens-day": { palette: brand("#b0306a", "#922858", "#922858", "#f2c94c", "#4a1530"), mood: "Алтанзул, мимоза" },
  "soldiers-day": { palette: brand("#4b5d2a", "#3c4b22", "#4b5d2a", "#c9a646", "#2b3418"), mood: "Хаки ногоон" },
  duichin: { palette: brand("#7b1f2e", "#651926", "#7b1f2e", "#e8a33a", "#4a1019"), mood: "Лам нарын улаан хүрэн, шар" },
  "childrens-day": { palette: brand("#1e64c8", "#1953a6", "#1953a6", "#ffd23f", "#0d3b7a"), mood: "Тэнгэрийн цэнхэр, нарны шар" },
  naadam: { palette: brand("#c8102e", "#a50d26", "#a50d26", "#f2b632", "#0b3d91"), mood: "Төрийн далбааны улаан, цэнхэр" },
  "knowledge-day": { palette: brand("#2a4b8d", "#223d73", "#2a4b8d", "#e9a03b", "#1a2f59"), mood: "Сургуулийн хөх, намрын шар" },
  "capital-day": { palette: brand("#0f6e7a", "#0c5a64", "#0c5a64", "#f0b52d", "#0a454d"), mood: "Туулын ус" },
  chinggis: { palette: brand("#12355b", "#0e2a49", "#12355b", "#c9a646", "#0a1f36"), mood: "Хөх тэнгэр, мөнгөн алт" },
  "republic-day": { palette: brand("#c8102e", "#a50d26", "#a50d26", "#f2b632", "#0b3d91"), mood: "Төрийн далбаа" },
  "independence-day": { palette: brand("#0b3d91", "#093275", "#0b3d91", "#f2b632", "#c8102e"), mood: "Тусгаар тогтнолын хөх" },
};
