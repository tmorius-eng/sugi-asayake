/**
 * Брэнд студийн зургийг R2-д (2026-10-05, Tom: "theme-ийн бүх зургийг лаптоп дээр биш R2 bucket-д,
 * тусдаа хавтсанд"). Репод зураг хадгалахгүй.
 *
 *   pnpm exec tsx scripts/upload-theme-assets.ts                       # dry-run
 *   pnpm exec tsx scripts/upload-theme-assets.ts --apply [--dir=…] [--sources=…]
 *
 * - Баярын постер → НИЙТИЙН bucket `themes/holidays/<HOLIDAY_POSTER_VERSION>/<key>{,-600w}.{webp,avif}`
 *   (shared/holidays.ts `poster` эндээс уншина). Объектууд 1 жилийн immutable кэштэй тул постерыг
 *   солих бол ХУВИЛБАРЫН хавтсыг ахиулна (v1 → v2), байгаа файлыг дарж бичихгүй.
 * - Эх PNG болон UI дизайны зураг → ХУВИЙН bucket `design/gemini/…` (нийтэд хаягтүй архив).
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";
import { HOLIDAY_KEYS, HOLIDAY_POSTER_VERSION } from "../shared/holidays";
import { storageObjectExists, storagePutExactKey, storagePutPrivate } from "../server/storage";

const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const apply = process.argv.includes("--apply");
const posterDir = arg("dir", "C:/Users/hero_/Pictures/gemini/holidays");
const sourceDirs = arg("sources", "C:/Users/hero_/Pictures/gemini/holidays,C:/Users/hero_/Pictures/gemini/brand-studio").split(",");

async function variants(png: Buffer) {
  const out: Array<{ suffix: string; type: string; data: Buffer }> = [];
  for (const [width, suffix] of [[1024, ""], [600, "-600w"]] as const) {
    out.push({ suffix: `${suffix}.webp`, type: "image/webp", data: await sharp(png).resize(width, width, { fit: "cover" }).webp({ quality: width === 600 ? 78 : 80 }).toBuffer() });
    out.push({ suffix: `${suffix}.avif`, type: "image/avif", data: await sharp(png).resize(width, width, { fit: "cover" }).avif({ quality: 55 }).toBuffer() });
  }
  return out;
}

async function main() {
  console.log(`${apply ? "UPLOAD" : "dry-run"} — постер: ${posterDir}`);
  for (const key of HOLIDAY_KEYS) {
    const file = join(posterDir, `${key}.png`);
    let png: Buffer;
    try { png = readFileSync(file); } catch { console.log(`  ⛔ ${key}: ${file} олдсонгүй`); continue; }
    for (const variant of await variants(png)) {
      const objectKey = `themes/holidays/${HOLIDAY_POSTER_VERSION}/${key}${variant.suffix}`;
      if (apply) {
        if (await storageObjectExists(objectKey)) { console.log(`  = ${objectKey} (аль хэдийн байна — дарж бичихгүй)`); continue; }
        await storagePutExactKey(objectKey, variant.data, variant.type);
      }
      console.log(`  ${apply ? "↑" : "·"} ${objectKey} ${Math.round(variant.data.length / 1024)} KB`);
    }
  }
  console.log(`\n${apply ? "UPLOAD" : "dry-run"} — эх файл (хувийн bucket, design/gemini/):`);
  for (const dir of sourceDirs) {
    let names: string[];
    try { names = readdirSync(dir).filter(name => /\.(png|jpe?g)$/i.test(name)); } catch { continue; }
    for (const name of names) {
      const folder = basename(dir);
      const data = readFileSync(join(dir, name));
      if (apply) {
        const stored = await storagePutPrivate(`design/gemini/${folder}/${name}`, data, name.endsWith(".png") ? "image/png" : "image/jpeg");
        console.log(`  ↑ ${stored.key}`);
      } else {
        console.log(`  · design/gemini/${folder}/${name} ${Math.round(data.length / 1024)} KB`);
      }
    }
  }
}

main().catch(error => { console.error(error); process.exit(1); });
