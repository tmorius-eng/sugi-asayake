import { describe, expect, it } from "vitest";
import { HOLIDAYS, HOLIDAY_POSTER_VERSION } from "../shared/holidays";
import { withHolidayPoster } from "./_core/holidayHero";
import { storageObjectExists } from "./storage";

// Баярын анхдагч постер R2-д (2026-10-05, scripts/upload-theme-assets.ts) — репод зураг байхгүй.
const describeWithMedia = process.env.RUN_MEDIA_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describe("баярын анхдагч постерууд", () => {
  it.each(HOLIDAYS.map(h => [h.key, h.poster] as const))("%s — R2 хувилбартай хавтасны зам", (key, poster) => {
    expect(poster).toBe(`/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/${key}.webp`);
  });

  it("постер home-hero слотыг солино, бусдыг хөндөхгүй; слот байхгүй бол нэмнэ", () => {
    const rows = [{ slotKey: "home-hero", imageUrl: "/a.webp" }, { slotKey: "home-hero-2", imageUrl: "/b.webp" }];
    expect(withHolidayPoster(rows, null)).toBe(rows);
    expect(withHolidayPoster(rows, "/p.webp").map(r => r.imageUrl)).toEqual(["/p.webp", "/b.webp"]);
    expect(withHolidayPoster([{ slotKey: "home-hero-2", imageUrl: "/b.webp" }], "/p.webp").find(r => r.slotKey === "home-hero")?.imageUrl).toBe("/p.webp");
  });
});

describeWithMedia("баярын постер R2-д бодитоор байна", () => {
  it.each(HOLIDAYS.map(h => [h.key, h.poster.replace(/^\/cdn\//, "")] as const))("%s — webp/avif × 1024/600", async (_key, objectKey) => {
    // hero shell AVIF-ийг R2-оос шалгадаг (imagePreload.ts hasAvif) — дутвал shell WebP, React AVIF сонгож зөрнө.
    for (const variant of [objectKey, objectKey.replace(".webp", "-600w.webp"), objectKey.replace(".webp", ".avif"), objectKey.replace(".webp", "-600w.avif")]) {
      expect(await storageObjectExists(variant), variant).toBe(true);
    }
  });
});
