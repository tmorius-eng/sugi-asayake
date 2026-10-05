import { DARK_TOKEN_KEYS, LIGHT_TOKEN_KEYS, RADIUS_PRESETS, normalizeHex, type ThemeLook } from "../../shared/theme-tokens";

/**
 * Брэнд студийн загварыг `<style id="brand-tokens">` болгоно (2026-10-05) — indexHtml.ts нь
 * HTML-ийн толгойд оруулж, React-ээс ӨМНӨ эхний зурагдалтад бодит өнгө байна (FOUC-гүй).
 *
 * Селектор: `html:root` (0,1,1) нь index.css-ийн `:root`-ийг (0,1,0), харанхуйд
 * `html:root[data-storefront-theme="dark"]` (0,2,1) нь index.css-ийн
 * `html[data-storefront-theme="dark"]`-ийг (0,1,1) ДАРААЛЛААС үл хамааран дарна — Vite-ийн
 * CSS link толгойн хаана ч орсон хамаагүй.
 *
 * Утга бүрийг `normalizeHex`-ээр ДАХИН шалгана (DB-д буруу утга орсон ч `}` / `;` гэх мэтээр
 * CSS-ээс гарч чадахгүй); CSP `style-src 'unsafe-inline'` зөвшөөрдөг.
 */
export function renderBrandTokensStyle(look: ThemeLook): string {
  const decl = (name: string, value: string | null) => (value ? `--${name}:${value};` : "");
  const light = LIGHT_TOKEN_KEYS.map(key => decl(key, normalizeHex(look.light[key]))).join("")
    + decl("radius", RADIUS_PRESETS[look.radius] ?? RADIUS_PRESETS.lg)
    + decl("product-aspect", look.productAspect.replace("/", " / "));
  const dark = DARK_TOKEN_KEYS.map(key => decl(key, normalizeHex(look.dark[key]))).join("");
  return `<style id="brand-tokens">html:root{${light}}html:root[data-storefront-theme="dark"]{${dark}}</style>`;
}
