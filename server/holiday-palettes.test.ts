import { describe, expect, it } from "vitest";
import { BASE_THEME, mergeLook } from "../shared/theme-tokens";
import { checkLookContrast } from "../shared/color/contrast";
import { HOLIDAY_KEYS } from "../shared/holidays";
import { HOLIDAY_PALETTES } from "../shared/holiday-palettes";

describe("баярын санал болгох өнгө", () => {
  it("13 баяр бүрт палитр байна", () => {
    expect(Object.keys(HOLIDAY_PALETTES).sort()).toEqual([...HOLIDAY_KEYS].sort());
  });
  it.each(Object.entries(HOLIDAY_PALETTES))("%s — үндсэн дээр давхарлахад AA давна", (_key, { palette }) => {
    const failing = checkLookContrast(mergeLook(BASE_THEME, { light: palette })).filter(r => !r.ok).map(r => `${r.label} ${r.ratio}`);
    expect(failing).toEqual([]);
  });
});
