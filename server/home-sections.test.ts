import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_LAYOUT, HOME_SECTION_KEYS, sanitizeFreeBlockProps, sanitizeHomeLayout } from "../shared/home-sections";

describe("нүүрний хэсгийн layout", () => {
  it("анхдагч нь одоогийн дараалал (бүгд харагдана), чөлөөт зурвас нуугдсан, hero ордоггүй", () => {
    expect(DEFAULT_HOME_LAYOUT.map(s => s.key)).toEqual(["chips", "bestsellers", "recommended", "brands", "categories", "story", "stats", "editorial", "stores", "free-1", "free-2", "free-3"]);
    expect(HOME_SECTION_KEYS).not.toContain("hero");
    expect(DEFAULT_HOME_LAYOUT.filter(s => s.visible).map(s => s.key)).toEqual(["chips", "bestsellers", "recommended", "brands", "categories", "story", "stats", "editorial", "stores"]);
    expect(DEFAULT_HOME_LAYOUT.find(s => s.key === "bestsellers")!.variant).toBe("rail");
  });

  it("эвдэрхий оролтоос үргэлж бүрэн layout", () => {
    expect(sanitizeHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(sanitizeHomeLayout("x")).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it("дараалал, нуулт, хувилбарыг хадгалж — үл мэдэх/давхар/буруу хувилбарыг хаяна, дутууг анхдагч харагдацаар төгсгөлд", () => {
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
    expect(out.find(s => s.key === "free-2")!.visible).toBe(false);
  });

  it("чөлөөт зурвас: текстийг тайрч, холбоос зөвхөн дотоод зам эсвэл #хэсэг", () => {
    expect(sanitizeFreeBlockProps({ heading: "  Шинэ ирэлт  ", text: "x".repeat(900), ctaLabel: "Үзэх", ctaHref: "/shop?category=skincare" }))
      .toEqual({ heading: "Шинэ ирэлт", text: "x".repeat(600), ctaLabel: "Үзэх", ctaHref: "/shop?category=skincare" });
    for (const bad of ["javascript:alert(1)", "https://evil.example", "//evil.example", String.raw`/\evil`]) expect(sanitizeFreeBlockProps({ ctaHref: bad }).ctaHref).toBe("");
    expect(sanitizeFreeBlockProps({ ctaHref: "#stores" }).ctaHref).toBe("#stores");
    const [first] = sanitizeHomeLayout([{ key: "free-1", visible: true, variant: "text-only", props: { heading: "Сайн уу" } }]);
    expect(first).toEqual({ key: "free-1", visible: true, variant: "text-only", props: { heading: "Сайн уу", text: "", ctaLabel: "", ctaHref: "" } });
  });
});
