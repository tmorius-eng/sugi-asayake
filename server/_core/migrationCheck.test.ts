import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_MIGRATIONS } from "./migrationCheck";

// Deploy-ийн хамгаалалт (2026-10-05): REQUIRED_MIGRATIONS нь drizzle/-тэй хамт
// урагшилж байх ёстой — эс бөгөөс шинэ migration-ийн багана уншдаг код хуучин
// DB дээр дахин чимээгүй унана (0098/0099-ийн сургамж).
describe("REQUIRED_MIGRATIONS", () => {
  const onDisk = readdirSync("drizzle").filter(name => name.endsWith(".sql")).sort();

  it("every required migration exists on disk", () => {
    for (const name of REQUIRED_MIGRATIONS) expect(onDisk).toContain(name);
  });

  it("the newest migration on disk is listed (add it when you write a new one)", () => {
    expect(REQUIRED_MIGRATIONS[REQUIRED_MIGRATIONS.length - 1]).toBe(onDisk[onDisk.length - 1]);
  });

  it("is sorted and unique", () => {
    expect([...REQUIRED_MIGRATIONS]).toEqual([...new Set(REQUIRED_MIGRATIONS)].sort());
  });
});
