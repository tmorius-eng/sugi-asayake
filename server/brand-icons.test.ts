import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BRAND_ICONS, renderBrandIcon, type BrandIconName } from "./_core/brandIcons";

// Эзэн солих (2026-10-05): логоноос таб/апп дүрс — хэмжээ, тунгалаг/цагаан дэвсгэр зөв эсэх.
describe("brand icons", () => {
  it.each(Object.keys(BRAND_ICONS) as BrandIconName[])("%s — зөв хэмжээ, PNG", async name => {
    const logo = await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 223, g: 31, b: 61, alpha: 1 } } }).png().toBuffer();
    const png = await renderBrandIcon(logo, name);
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe("png");
    expect([meta.width, meta.height]).toEqual([BRAND_ICONS[name].size, BRAND_ICONS[name].size]);
    // Булангийн пиксел: apple/maskable цагаан (iOS/Android тунгалагийг өөрөөр дүүргэдэг), бусад нь тунгалаг.
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corner = [data[0], data[1], data[2], data[3]];
    expect(corner).toEqual(BRAND_ICONS[name].background ? [255, 255, 255, 255] : [0, 0, 0, 0]);
  });
});
