import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_LAYOUT, HOME_SECTION_KEYS, sanitizeHomeLayout } from "../shared/home-sections";

describe("нүүрний хэсгийн layout", () => {
  it("анхдагч нь одоогийн дараалал, hero ордоггүй (тогтмол эхэнд)", () => {
    expect(DEFAULT_HOME_LAYOUT.map(s => s.key)).toEqual(["chips", "bestsellers", "recommended", "brands", "categories", "story", "stats", "editorial", "stores"]);
    expect(HOME_SECTION_KEYS).not.toContain("hero");
    expect(DEFAULT_HOME_LAYOUT.every(s => s.visible)).toBe(true);
  });

  it("эвдэрхий оролтоос үргэлж бүрэн layout", () => {
    expect(sanitizeHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(sanitizeHomeLayout("x")).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it("дараалал, нуулт, хувилбарыг хадгалж — үл мэдэх/давхар/буруу хувилбарыг хаяна, дутууг төгсгөлд нэмнэ", () => {
    const out = sanitizeHomeLayout([
      { key: "stores", visible: true, variant: "default" },
      { key: "hero", visible: false },
      { key: "editorial", visible: true, variant: "image-right" },
      { key: "editorial", visible: false },
      { key: "chips", visible: false, variant: "<script>" },
      { key: "evil" },
    ]);
    expect(out.slice(0, 3)).toEqual([
      { key: "stores", visible: true, variant: "default" },
      { key: "editorial", visible: true, variant: "image-right" },
      { key: "chips", visible: false, variant: "default" },
    ]);
    expect(out).toHaveLength(HOME_SECTION_KEYS.length);
    expect(new Set(out.map(s => s.key)).size).toBe(HOME_SECTION_KEYS.length);
  });
});
