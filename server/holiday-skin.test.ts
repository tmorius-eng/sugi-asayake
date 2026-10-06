import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HOLIDAYS, HOLIDAY_SKINS, HOLIDAY_SKIN_VERSION, hasHolidaySkin, holidaySkinHref } from "../shared/holidays";

/**
 * Баярын бүтэн-сайтын загвар (skin, 2026-10-06). Skin нь `client/public/holiday-skins/<key>.css`
 * файл + `<html data-skin>` тэмдэг. Эдгээр тест нь: бүртгэл ↔ файл зөрөхгүй, CSS нь зөвхөн
 * өөрийн `data-skin` доор үйлчилнэ (бусад баяр/энгийн өдөр/admin-д нөлөөлөхгүй), CSS-ийн
 * дурдсан зураг, фонт бодитоор байна.
 */
const PUBLIC_DIR = resolve(__dirname, "..", "client", "public");
const skinCss = (key: string) => readFileSync(resolve(PUBLIC_DIR, "holiday-skins", `${key}.css`), "utf8");

describe("holiday skin registry", () => {
  it("every registered skin is a real holiday and has its CSS file", () => {
    for (const key of HOLIDAY_SKINS) {
      expect(HOLIDAYS.some(holiday => holiday.key === key), `${key} is not a known holiday`).toBe(true);
      expect(existsSync(resolve(PUBLIC_DIR, "holiday-skins", `${key}.css`)), `${key}.css is missing`).toBe(true);
    }
  });

  it("recognises only registered skins", () => {
    expect(hasHolidaySkin("new-year")).toBe(true);
    expect(hasHolidaySkin("tsagaan-sar")).toBe(false);
    expect(hasHolidaySkin(null)).toBe(false);
    expect(hasHolidaySkin(undefined)).toBe(false);
    expect(hasHolidaySkin("../../etc/passwd")).toBe(false);
  });

  it("builds a versioned, same-origin stylesheet href", () => {
    expect(holidaySkinHref("new-year")).toBe(`/holiday-skins/new-year.css?v=${HOLIDAY_SKIN_VERSION}`);
  });
});

describe.each([...HOLIDAY_SKINS])("holiday skin CSS: %s", key => {
  const css = skinCss(key);
  // Strip comments and @font-face blocks; what remains are the selector rules.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = withoutComments.replace(/@font-face\s*\{[^}]*\}/g, "");

  it("scopes every selector under its own data-skin attribute", () => {
    // Collect selector lists (text before each `{`), skipping @media wrappers.
    const selectorLists = [...rules.matchAll(/([^{}]+)\{/g)].map(match => match[1].trim()).filter(list => list && !list.startsWith("@"));
    expect(selectorLists.length).toBeGreaterThan(20);
    for (const list of selectorLists) {
      for (const selector of list.split(",").map(part => part.trim()).filter(Boolean)) {
        expect(selector, `unscoped selector: ${selector}`).toContain(`[data-skin="${key}"]`);
      }
    }
  });

  it("never styles /admin: no bare element, .dark or shadcn selectors", () => {
    expect(rules).not.toMatch(/(^|[\s,}])(body|html)\s*\{/);
    expect(rules).not.toContain(".dark");
  });

  it("every image and font it references exists on disk", () => {
    const urls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]).filter(url => !url.startsWith("data:") && !url.startsWith("http"));
    expect(urls.length).toBeGreaterThan(5);
    for (const url of urls) {
      const file = url.startsWith("/") ? resolve(PUBLIC_DIR, url.slice(1)) : resolve(PUBLIC_DIR, "holiday-skins", url);
      expect(existsSync(file), `missing asset: ${url}`).toBe(true);
    }
  });

  it("uses no hex colour that the brand tokens already own", () => {
    // Баярын skin өөрийн палитрыг `--ny-*` токеноор тодорхойлно; брэндийн улаан/цэнхэр шууд бичигдэхгүй.
    for (const brandHex of ["#df1f3d", "#bc1732", "#b01729", "#1e3ad6"]) expect(css.toLowerCase()).not.toContain(brandHex);
  });
});
