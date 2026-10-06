import type { DarkThemeTokens, ThemeTokens } from "./theme-tokens";

/**
 * Баярын skin-ийн АНХДАГЧ ӨНГӨ (2026-10-06). Skin-ийн CSS (client/public/holiday-skins/<key>.css)
 * палитраа өөрөө тохируулдаггүй: өнгө нь Брэнд студийн загварын look-ийн нэг хэсэг тул админ
 * "Өнгө" табаас засахад бодитоор үйлчилнэ. Давхаргын дараалал (дээд нь давамгайлна):
 *   админы хадгалсан баярын өөрчлөлт (site_themes.lookJson)
 *   → энэ skin-ийн анхдагч өнгө (skin асаалттай үед)
 *   → үндсэн загвар (base)
 * Skin-ийн CSS зөвхөн токенд ордоггүй зүйлийг (хэлбэр, чимэг, serif фонт, --cart-blue) тодорхойлно.
 *
 * Бүх өнгө AA (4.5:1) — server/holiday-skin.test.ts `checkLookContrast`-аар тулгана.
 */
export interface SkinLookPatch {
  light: Partial<ThemeTokens>;
  dark?: Partial<DarkThemeTokens>;
}

export const HOLIDAY_SKIN_LOOKS: Record<string, SkinLookPatch> = {
  // Шинэ жил — чиглэл C "Баярын дулаан": цайвар цайр, ойн ногоон, алт, шүр-улаан.
  "new-year": {
    light: {
      background: "#f7f1e8", foreground: "#2b2620",
      card: "#fdfaf3", "card-foreground": "#2b2620",
      popover: "#fdfaf3", "popover-foreground": "#2b2620",
      primary: "#2f5b43", "primary-foreground": "#fdfaf3", "primary-text": "#244634", "primary-hover": "#244634",
      secondary: "#ece3d4",
      muted: "#efe8db", "muted-foreground": "#6c6357",
      accent: "#e8c97a", "accent-foreground": "#2b2620",
      border: "#e6dcc9", input: "#e6dcc9", ring: "#2f5b43",
      sky: "#865c18", "surface-tint": "#efe7d8",
      "ck-ink": "#2b2620", "ck-muted": "#6c6357", "ck-line": "#e6dcc9", "ck-cream": "#f1e9dc", "ck-chip": "#efe7d8",
      "ck-gold": "#865c18", "ck-page": "#f7f1e8", "ck-surface": "#fdfaf3",
      "promo-bar-bg": "#2f5b43", "promo-bar-fg": "#e8c97a",
    },
    dark: {
      "ck-page": "#121a15", "ck-surface": "#1a241e", "ck-cream": "#151e19", "ck-chip": "#1f2a23",
      "ck-ink": "#f1ece0", "ck-muted": "#b2a894", "ck-line": "#2e4035", "ck-gold": "#e3c27a",
    },
  },
};
