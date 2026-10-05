import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { storefrontFiles, transformLine } from "../scripts/codemod-hex-to-tokens";

/**
 * Брэнд студи A5 (2026-10-05): storefront-ийн кодонд брэнд өнгө hex-ээр ДАХИН орохгүй — эс бөгөөс
 * Брэнд студид үндсэн өнгө солиход тэр газар хуучин өнгө хэвээр үлдэнэ (шинэ эзэнд худалдсан сайт
 * дээр SUGI-ийн улаан гарна). Засвар: `pnpm exec tsx scripts/codemod-hex-to-tokens.ts --write`.
 * Зориуд үлдсэн: SVG attribute (одны алтлаг fill, InstallGuide-ийн зураг), data URI, токены тодорхойлолт.
 */
describe("storefront-д хатуу брэнд hex байхгүй", () => {
  it("codemod-д солигдох мөр нэг ч үлдээгүй", () => {
    const offenders: string[] = [];
    for (const file of storefrontFiles()) {
      readFileSync(file, "utf8").split("\n").forEach((line, index) => {
        if (transformLine(line) !== line) offenders.push(`${relative(process.cwd(), file)}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
