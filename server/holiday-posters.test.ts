import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOLIDAYS } from "../shared/holidays";
import { withHolidayPoster } from "./_core/holidayHero";
import { hasAvif } from "./_core/imagePreload";

const publicDir = join(__dirname, "..", "client", "public");

describe("баярын анхдагч постерууд", () => {
  it.each(HOLIDAYS.map(h => [h.key, h.poster] as const))("%s — webp/avif, 1024 ба 600w бүгд байна", (_key, poster) => {
    expect(poster).toMatch(/^\/images\/holidays\/[a-z-]+\.webp$/);
    const base = poster.slice(0, -".webp".length);
    // hero shell AVIF-ийг "байгаа" гэж тооцдог (imagePreload.ts LOCAL_AVIF_PREFIXES) — дутвал зураг эвдэрнэ.
    for (const file of [`${base}.webp`, `${base}-600w.webp`, `${base}.avif`, `${base}-600w.avif`]) {
      expect(existsSync(join(publicDir, file)), file).toBe(true);
    }
  });

  it("локал постерийн AVIF-ийг hero shell мэддэг (React-тэй ижил файл сонгоно)", async () => {
    expect(await hasAvif("/images/holidays/naadam.webp")).toBe(true);
    expect(await hasAvif("/images/holidays/naadam-600w.webp")).toBe(false);
  });

  it("постер home-hero слотыг солино, бусдыг хөндөхгүй; слот байхгүй бол нэмнэ", () => {
    const rows = [{ slotKey: "home-hero", imageUrl: "/a.webp" }, { slotKey: "home-hero-2", imageUrl: "/b.webp" }];
    expect(withHolidayPoster(rows, null)).toBe(rows);
    expect(withHolidayPoster(rows, "/p.webp").map(r => r.imageUrl)).toEqual(["/p.webp", "/b.webp"]);
    expect(withHolidayPoster([{ slotKey: "home-hero-2", imageUrl: "/b.webp" }], "/p.webp").find(r => r.slotKey === "home-hero")?.imageUrl).toBe("/p.webp");
  });
});
