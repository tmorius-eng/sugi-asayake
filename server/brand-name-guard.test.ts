import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Эзэн солих (2026-10-05): client кодонд "SUGI ASAYAKE" хатуу бичихгүй — `brandName()` / `brandTitle()`
 * (client/src/lib/brand.ts, admin-аас `brand-text-short-name`). Эс бөгөөс шинэ эзэнд худалдсан сайт
 * дээр хуучин нэр гарна. Тайлбар (comment) ба site_text-ийн засварлагддаг fallback (`textFor(...)`) зөвшөөрнө.
 */
const ROOT = join(__dirname, "..", "client", "src");
const ALLOW = new Set(["lib/brand.ts"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(tsx?|ts)$/.test(name) ? [full] : [];
  });
}

describe("client кодонд брэндийн нэр хатуу бичигдээгүй", () => {
  it("SUGI ASAYAKE зөвхөн comment ба lib/brand.ts-д", () => {
    const offenders: string[] = [];
    for (const file of files(ROOT)) {
      const rel = relative(ROOT, file).replaceAll("\\", "/");
      if (ALLOW.has(rel)) continue;
      let inBlock = false;
      readFileSync(file, "utf8").split("\n").forEach((line, index) => {
        const trimmed = line.trim();
        if (inBlock) { if (trimmed.includes("*/")) inBlock = false; return; }
        if (/^(\/\/|\*)/.test(trimmed)) return;
        if (/^(\/\*|\{\/\*)/.test(trimmed)) { if (!trimmed.includes("*/")) inBlock = true; return; }
        if (/SUGI ASAYAKE/i.test(line)) offenders.push(`${rel}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
