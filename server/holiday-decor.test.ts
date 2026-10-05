import { describe, expect, it } from "vitest";
import { EFFECT_LABELS, HOLIDAY_EFFECTS, HOLIDAY_ORNAMENTS, ORNAMENT_LABELS, ORNAMENT_SVG, isHolidayEffect, isHolidayOrnament, ornamentDataUri } from "../shared/holiday-decor";

describe("баярын чимэглэл", () => {
  it("эффект/хээ бүр монгол шошготой, анхдагч none", () => {
    for (const effect of HOLIDAY_EFFECTS) expect(EFFECT_LABELS[effect]).toBeTruthy();
    for (const ornament of HOLIDAY_ORNAMENTS) expect(ORNAMENT_LABELS[ornament]).toBeTruthy();
    expect(HOLIDAY_EFFECTS[0]).toBe("none");
    expect(HOLIDAY_ORNAMENTS[0]).toBe("none");
  });
  it("дэнлүү, хас хээ ЗОРИУД байхгүй", () => {
    expect(HOLIDAY_EFFECTS as readonly string[]).not.toContain("lanterns");
    expect(HOLIDAY_ORNAMENTS as readonly string[]).not.toContain("khas");
  });
  it("үл мэдэх утгыг татгалзана", () => {
    expect(isHolidayEffect("snow")).toBe(true);
    expect(isHolidayEffect("<script>")).toBe(false);
    expect(isHolidayOrnament("alkhan")).toBe(true);
    expect(isHolidayOrnament("khas")).toBe(false);
  });
  it("хээ нь цэвэр SVG, data URI кодлогдсон", () => {
    expect(ORNAMENT_SVG.alkhan.startsWith("<svg")).toBe(true);
    expect(ORNAMENT_SVG.alkhan).not.toMatch(/script|on\w+=/i);
    expect(ornamentDataUri("alkhan")).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/);
  });
});
