import { describe, expect, it } from "vitest";
import { HOLIDAYS, getHoliday } from "../shared/holidays";
import { activeHoliday, addDays, holidayOccurrence, holidayWindow, isDateKey, nextHoliday, type HolidaySettings } from "../shared/theme-resolver";

const all = (overrides: Record<string, Partial<HolidaySettings>> = {}) =>
  Object.fromEntries(HOLIDAYS.map(h => [h.key, { enabled: true, ...overrides[h.key] }])) as Record<string, HolidaySettings>;

describe("огнооны туслах", () => {
  it("addDays/isDateKey", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-02-28")).toBe(true);
  });
});

describe("holidayOccurrence", () => {
  it("Цагаан сар: Битүүн + шинийн 1–3 (4 өдөр)", () => {
    expect(holidayOccurrence(getHoliday("tsagaan-sar")!, 2027)).toEqual({ start: "2027-02-06", end: "2027-02-09" });
    expect(holidayOccurrence(getHoliday("tsagaan-sar")!, 2026)).toEqual({ start: "2026-02-17", end: "2026-02-20" });
  });
  it("Наадам 7/10–15, тогтмол баяр", () => {
    expect(holidayOccurrence(getHoliday("naadam")!, 2027)).toEqual({ start: "2027-07-10", end: "2027-07-15" });
  });
  it("сарны хүснэгтэд байхгүй жил → null (таамаглахгүй)", () => {
    expect(holidayOccurrence(getHoliday("duichin")!, 2027)).toBeNull();
    expect(holidayOccurrence(getHoliday("tsagaan-sar")!, 2040)).toBeNull();
  });
});

describe("activeHoliday", () => {
  it("анхдагчаар (асаагаагүй) ямар ч баяр идэвхгүй", () => {
    expect(activeHoliday("2027-02-07", {})).toBeNull();
  });
  it("Цагаан сар 14 хоногийн өмнө асна, маргааш нь унтарна", () => {
    const s = all();
    expect(activeHoliday("2027-01-22", s)?.key).not.toBe("tsagaan-sar"); // Битүүн 02-06 − 14 = 01-23
    expect(activeHoliday("2027-01-23", s)?.key).toBe("tsagaan-sar");
    expect(activeHoliday("2027-02-10", s)?.key).toBe("tsagaan-sar");
    expect(activeHoliday("2027-02-11", s)?.key).not.toBe("tsagaan-sar");
  });
  it("Шинэ жилийн цонх жилийн заагийг давна; 12/29 нь priority-гоор ялна", () => {
    const s = all();
    expect(activeHoliday("2026-12-20", s)?.key).toBe("new-year");
    expect(activeHoliday("2026-12-29", s)?.key).toBe("independence-day");
    expect(activeHoliday("2027-01-02", s)?.key).toBe("new-year");
    expect(activeHoliday("2027-01-03", s)).toBeNull();
  });
  it("Цагаан сар (90) нь Валентинаас (70) давамгайлна — давхцах жилд", () => {
    // 2026: Цагаан сар 02-17..02-20, цонх 02-03..02-21; Валентин 02-07..02-14
    expect(activeHoliday("2026-02-14", all())?.key).toBe("tsagaan-sar");
    expect(activeHoliday("2026-02-14", all({ "tsagaan-sar": { enabled: false } }))?.key).toBe("valentine");
  });
  it("override цонх дүрмийг дарна (хүснэгтэд байхгүй жилд ч)", () => {
    const s = { duichin: { enabled: true, overrideStart: "2027-06-15", overrideEnd: "2027-06-19" } };
    expect(activeHoliday("2027-06-17", s)?.key).toBe("duichin");
    expect(holidayWindow(getHoliday("duichin")!, 2027, s.duichin)).toEqual({ start: "2027-06-15", end: "2027-06-19" });
  });
  it("offset-ыг хязгаарлана (−60…0, 0…14)", () => {
    const w = holidayWindow(getHoliday("valentine")!, 2027, { enabled: true, startOffsetDays: -999, endOffsetDays: 999 })!;
    expect(w).toEqual({ start: addDays("2027-02-14", -60), end: addDays("2027-02-14", 14) });
  });
});

describe("nextHoliday", () => {
  it("дараагийн асах баярыг өгнө", () => {
    const next = nextHoliday("2026-10-05", all());
    expect(next?.key).toBe("capital-day");
    expect(next?.start).toBe("2026-10-26");
  });

  it("гараар оруулсан огноо зөвхөн тэр жилд — дараа жилд дүрэм рүүгээ буцна (баяр бүрмөсөн унтрахгүй)", () => {
    const naadam = getHoliday("naadam")!;
    const settings = { enabled: true, overrideStart: "2026-07-01", overrideEnd: "2026-07-20" };
    expect(holidayWindow(naadam, 2026, settings)).toEqual({ start: "2026-07-01", end: "2026-07-20" });
    expect(holidayWindow(naadam, 2027, settings)).toEqual(holidayWindow(naadam, 2027, { enabled: true }));
    // Жилийн заагтай override (Шинэ жил) хоёр жилд нэг цонх.
    const ny = getHoliday("new-year")!;
    const nySettings = { enabled: true, overrideStart: "2026-12-20", overrideEnd: "2027-01-03" };
    expect(holidayWindow(ny, 2027, nySettings)).toEqual({ start: "2026-12-20", end: "2027-01-03" });
  });
});
