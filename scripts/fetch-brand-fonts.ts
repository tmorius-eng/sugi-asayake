/**
 * Брэнд студийн фонтууд (A2, 2026-10-05): Google Fonts-оос variable woff2-ийг 4 subset-ээр
 * (cyrillic-ext — монгол Ө/Ү, cyrillic, latin-ext, latin) татаж client/public/fonts/<key>/-д
 * хадгална. CSP `font-src 'self'` тул R2 биш, сайтын өөрийн замаас. Бүгд SIL OFL 1.1.
 *
 *   pnpm exec tsx scripts/fetch-brand-fonts.ts            # shared/fonts.ts-ийн бүх (golos-оос бусад) фонт
 *
 * Үр дүнгийн unicode-range-ийг shared/fonts.ts дахь `FONT_SUBSETS`-тэй тулгана (Google-ийн хуваалт).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND_FONTS } from "../shared/fonts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const WANTED = ["cyrillic-ext", "cyrillic", "latin-ext", "latin"];

async function main() {
  for (const font of BRAND_FONTS.filter(f => f.key !== "golos")) {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family)}:wght@${font.weights}&display=swap`;
    const css = await (await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) })).text();
    const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g)];
    const dir = join(process.cwd(), "client", "public", "fonts", font.key);
    mkdirSync(dir, { recursive: true });
    const got: string[] = [];
    for (const [, subset, body] of blocks) {
      if (!WANTED.includes(subset)) continue;
      const src = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
      if (!src) continue;
      const data = Buffer.from(await (await fetch(src, { signal: AbortSignal.timeout(30_000) })).arrayBuffer());
      writeFileSync(join(dir, `${subset}.woff2`), data);
      got.push(`${subset} ${Math.round(data.length / 1024)}KB`);
    }
    const missing = WANTED.filter(subset => !got.some(entry => entry.startsWith(`${subset} `)));
    console.log(`${font.key.padEnd(14)} ${got.join(", ")}${missing.length ? `  ⛔ дутуу: ${missing.join(", ")}` : ""}`);
  }
}

main().catch(error => { console.error(error); process.exit(1); });
