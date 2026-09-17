/**
 * Брэндийн логооос хөтөч/утасны 6 дүрсийг үүсгэнэ (2026-09-17).
 *
 * Яагаад script хэрэгтэй вэ: лого нь `brand-logo` / `brand-symbol` slot болсон
 * тул /admin-аас солигддог, ГЭХДЭЭ хөтчийн таб ба утасны нүүр дэлгэц дээрх
 * дүрс нь `index.html` / `manifest.webmanifest`-д нэрлэгдсэн СТАТИК файлууд —
 * тэдгээр нь DB-ээс уншигддаггүй. Лого сольсны дараа эдгээрийг гараар дахин
 * үүсгэхгүй бол утсан дээр ХУУЧИН тэмдэг үлдэнэ (2026-09-17-нд яг ийм байдал
 * илэрсэн: толгой хэсэгт SUGI ASAYAKE лого атлаа утасны дүрс нь огт өөр
 * навч-нарны тэмдэг байв).
 *
 * Хэрэглээ:
 *   pnpm exec tsx scripts/generate-brand-icons.ts <зам-логоны-файл>
 *   pnpm exec tsx scripts/generate-brand-icons.ts <зам> --bg "#ffffff"
 *
 * Дараа нь `pnpm build` + deploy. Файлууд `client/public/icons/`-д бичигдэнэ.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

type IconSpec = {
  file: string;
  size: number;
  /** Дүрсийн ирмэг хүртэлх зай (хувиар). Maskable-д Android дүрсийг дугуй/
   *  дөрвөлжин болгож ТАЙРДАГ тул "аюулгүй бүс" нь голын ~80% — 20% зай
   *  үлдээвэл ямар ч хэлбэрт логоны үсэг таслагдахгүй. */
  padding: number;
};

const ICONS: IconSpec[] = [
  { file: "favicon-64.png", size: 64, padding: 0.04 },
  { file: "apple-touch-icon.png", size: 180, padding: 0.1 },
  { file: "icon-192.png", size: 192, padding: 0.08 },
  { file: "icon-512.png", size: 512, padding: 0.08 },
  { file: "maskable-192.png", size: 192, padding: 0.2 },
  { file: "maskable-512.png", size: 512, padding: 0.2 },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const source = args.find(arg => !arg.startsWith("--"));
  const bgIndex = args.indexOf("--bg");
  // Ил тод дэвсгэр нь iOS дээр ХАР болж хувирдаг (apple-touch-icon-ийг
  // композит хийхдээ alpha-г хаядаг) тул анхдагч нь цагаан.
  const background = bgIndex >= 0 ? args[bgIndex + 1] : "#ffffff";
  if (!source) {
    console.error("Хэрэглээ: pnpm exec tsx scripts/generate-brand-icons.ts <логоны-файл> [--bg \"#ffffff\"]");
    process.exit(1);
  }
  return { source: resolve(source), background };
}

async function main() {
  const { source, background } = parseArgs();
  if (!existsSync(source)) throw new Error(`Файл олдсонгүй: ${source}`);

  const meta = await sharp(source).metadata();
  console.log(`Эх лого: ${source}`);
  console.log(`  ${meta.width}x${meta.height}, ${meta.format}, alpha=${meta.hasAlpha ? "тийм" : "үгүй"}`);
  if ((meta.width ?? 0) < 512 || (meta.height ?? 0) < 512) {
    console.warn("  ⚠️ 512px-ээс жижиг эх файл — 512 дүрс бүдэг гарна. Илүү том файл ашиглахыг зөвлөе.");
  }

  const outDir = join(process.cwd(), "client", "public", "icons");
  await mkdir(outDir, { recursive: true });

  for (const spec of ICONS) {
    const inner = Math.round(spec.size * (1 - spec.padding * 2));
    // `contain` — лого тайрагдахгүй, бүтнээрээ багтана (`cover` нь үсгийг
    // тасалдаг). Дараа нь дэвсгэр дээр голлуулж байрлуулна.
    const logo = await sharp(source)
      .resize({ width: inner, height: inner, fit: "inside", withoutEnlargement: false })
      .toBuffer();
    const buffer = await sharp({
      create: { width: spec.size, height: spec.size, channels: 4, background },
    })
      .composite([{ input: logo, gravity: "center" }])
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(join(outDir, spec.file), buffer);
    console.log(`  ✓ ${spec.file.padEnd(22)} ${spec.size}x${spec.size}  (зай ${Math.round(spec.padding * 100)}%)`);
  }

  console.log("\nДараагийн алхам: pnpm build → нүдээр шалгах → deploy.");
  console.log("⚠️ Хөтөч дүрсийг маш удаан кэшлэдэг — шалгахдаа hard reload (Ctrl+F5) хийнэ.");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
