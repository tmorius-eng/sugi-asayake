import { describe, expect, it } from "vitest";
import { guessDistrictFromAddress } from "@shared/districts";

/**
 * 2026-09-23. `guessDistrictFromAddress` нь нэг жагсаалтаар явж, эхний
 * таарсныг буцаадаг байв — тэр жагсаалтад 2–3 үсгийн товчлолууд (`худ`, `нд`,
 * `чд` …) үгийн хилгүй байсан тул ЭНГИЙН үгийн дотор таарч байв: "Худалдааны"
 * дотор `худ`, "Өндөр"/"Индустри"/"Гандан" дотор `нд`. Үр дүнд нь хүргэлтийн
 * дүүрэг ба аналитикийн "дүүрэг"-ийн задаргаа Хан-Уул/Налайх тал руу
 * хазайдаг байсан. Одоо бүтэн нэрүүд түрүүлж, товчлолууд зөвхөн бие даасан
 * үг байх үед таарна.
 */
describe("guessDistrictFromAddress", () => {
  it("prefers the full district name over an abbreviation hiding inside an ordinary word", () => {
    // "Худалдааны" дотор "худ" (Хан-Уул) байна — бүтэн нэр нь Налайх.
    expect(guessDistrictFromAddress("Налайх дүүрэг, Худалдааны гудамж")).toBe("nalaikh");
    // "Индустрийн" дотор "нд" (Налайх) байна — бүтэн нэр нь Багахангай.
    expect(guessDistrictFromAddress("Багахангай дүүрэг, Индустрийн гудамж")).toBe("bagakhangai");
    // "Өндөр" дотор "нд" байна — бүтэн нэр нь Багануур.
    expect(guessDistrictFromAddress("Багануур дүүрэг, Өндөр хороолол")).toBe("baganuur");
  });

  it("still reads a stand-alone abbreviation, the way real addresses are written", () => {
    expect(guessDistrictFromAddress("ХУД, 15-р хороо, байр 3")).toBe("khan_uul");
    expect(guessDistrictFromAddress("БЗД 14-р хороо")).toBe("bayanzurkh");
    expect(guessDistrictFromAddress("сбд, 8-р хороо")).toBe("sukhbaatar");
  });

  it("reads full names in Cyrillic and in romanised spelling", () => {
    expect(guessDistrictFromAddress("Хан-Уул дүүрэг, 4-р хороо")).toBe("khan_uul");
    expect(guessDistrictFromAddress("Khan Uul district")).toBe("khan_uul");
    expect(guessDistrictFromAddress("Сонгинохайрхан дүүрэг")).toBe("songinokhairkhan");
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(guessDistrictFromAddress("Дархан хот, 5-р баг")).toBeNull();
    expect(guessDistrictFromAddress("")).toBeNull();
    expect(guessDistrictFromAddress(null)).toBeNull();
  });

  it("does not read a district out of an unrelated word", () => {
    // Хаана ч дүүрэг дурдаагүй — "Худалдааны төв" дангаараа Хан-Уул биш.
    expect(guessDistrictFromAddress("Худалдааны төв, 2 давхар")).toBeNull();
    expect(guessDistrictFromAddress("Гандан хийдийн ойролцоо")).toBeNull();
  });
});
