import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import type { Request, Response } from "express";
import sharp from "sharp";
import { getSiteMedia, getStoreSettingValue } from "../db";
import { storageGetSignedUrl } from "../storage";
import { storageKeyOf } from "./publicUrl";
import { getOrSetCached } from "./ttlCache";

/**
 * Хөтчийн таб/утасны апп дүрс логоноос (эзэн солих, 2026-10-05). Өмнө нь `client/public/icons/*.png`
 * статик — шинэ эзэн лого сольсон ч хуучин дүрс гарсаар байв.
 *
 * `/brand-icon/<нэр>.png`: `brand-icons-from-symbol=1` БӨГӨӨД /admin-аас `brand-symbol` upload
 * хийсэн бол түүнээс sharp-аар үүсгэнэ (1 цаг кэш); эс бөгөөс статик `/icons/<нэр>.png` руу 302 —
 * тохиргоо асаагаагүй сайтын дүрс ЯГ хэвээр (загварын шийдвэр эзнийх).
 */
export const BRAND_ICONS = {
  "favicon-64": { size: 64, padding: 0.04, background: null },
  "apple-touch-icon": { size: 180, padding: 0.12, background: "#ffffff" }, // iOS тунгалагийг хараар дүүргэдэг
  "icon-192": { size: 192, padding: 0.08, background: null },
  "icon-512": { size: 512, padding: 0.08, background: null },
  "maskable-192": { size: 192, padding: 0.2, background: "#ffffff" }, // Android-ийн safe zone (80%)
  "maskable-512": { size: 512, padding: 0.2, background: "#ffffff" },
} as const;
export type BrandIconName = keyof typeof BRAND_ICONS;

/** Логоны байт: R2-д байвал signed URL-аар, кодын анхдагч бол public хавтаснаас (production: dist/public). */
export async function readSiteImageBytes(url: string): Promise<Buffer> {
  const key = storageKeyOf(url);
  if (key) {
    const response = await fetch(await storageGetSignedUrl(key), { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`image fetch ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  if (!url.startsWith("/") || url.includes("..")) throw new Error("unsupported image url");
  for (const dir of [join(process.cwd(), "dist", "public"), join(process.cwd(), "client", "public")]) {
    const file = normalize(join(dir, url));
    if (file.startsWith(dir) && existsSync(file)) return readFile(file);
  }
  throw new Error("image file not found");
}

export async function renderBrandIcon(source: Buffer, name: BrandIconName): Promise<Buffer> {
  const spec = BRAND_ICONS[name];
  const inner = Math.round(spec.size * (1 - spec.padding * 2));
  const logo = await sharp(source).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: spec.size, height: spec.size, channels: 4, background: spec.background ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Үүсгэсэн дүрсийн эх зураг (тохиргоо асаалттай + upload хийсэн үед), эс бөгөөс null. */
export async function brandIconSource(): Promise<string | null> {
  if ((await getStoreSettingValue("brand-icons-from-symbol")).trim() !== "1") return null;
  const media = await getSiteMedia();
  return media.find(row => row.slotKey === "brand-symbol")?.imageUrl ?? null;
}

export async function serveBrandIcon(req: Request, res: Response) {
  const name = String(req.params.name ?? "") as BrandIconName;
  if (!Object.hasOwn(BRAND_ICONS, name)) { res.status(404).end(); return; }
  const fallback = `/icons/${name}.png`;
  try {
    const source = await brandIconSource();
    if (!source) { res.redirect(302, fallback); return; }
    const png = await getOrSetCached(`brand-icon:${source}:${name}`, 60 * 60_000, async () => renderBrandIcon(await readSiteImageBytes(source), name));
    res.type("image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(png);
  } catch {
    res.redirect(302, fallback);
  }
}
