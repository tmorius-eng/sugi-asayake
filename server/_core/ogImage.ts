/**
 * /og/product/<slug>.jpg — хуваалцсан барааны линк Facebook, Messenger, Telegram,
 * X дээр харуулах зураг (2026-09-14).
 *
 * Tom утаснаасаа бараа хуваалцахад Facebook жижиг дөрвөлжин thumbnail-ийг гарчгийн
 * хажууд зурсан: Cocochi packshot 270x390 px бөгөөд Facebook дор хаяж 600x315
 * (1200x630 зөвлөмж, 1.91:1) зурагт л том зурагтай карт зурдаг. Каталогийн зураг
 * бүх хэмжээтэй тул найдахын оронд сервер бараа бүрт карт угсарна: packshot-ыг
 * 1200x630 цагаан canvas дотор багтааж, төвлөрүүлж, JPEG. routeMeta.ts og:image-ийг
 * энэ URL руу зааж хэмжээг зарладаг тул crawler таамаглах шаардлагагүй.
 *
 * Диск дээр (tmpdir) slug + эх URL-аар кэшлэгдэнэ — дахин upload хийсэн зураг шинэ
 * карт авна, өөрчлөгдөөгүй нь нэг л удаа угсрагдана. Долоо хоногийн cache-тэй.
 * Бараа байхгүй -> 404; зураг татагдахгүй -> 503, эвдэрсэн карт хэзээ ч биш.
 */
import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { getProductBySlug } from "../db";
import { ENV } from "./env";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
const PADDING = 40;
const CACHE_DIR = join(tmpdir(), "sugi-og-cache");

function absoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = (ENV.publicBaseUrl || "https://sugiasayake.mn").replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export async function composeProductCard(sourceUrl: string): Promise<Buffer> {
  const response = await fetch(absoluteUrl(sourceUrl), { redirect: "follow" });
  if (!response.ok) throw new Error(`source image ${response.status}`);
  const source = Buffer.from(await response.arrayBuffer());
  const packshot = await sharp(source)
    .resize(OG_WIDTH - PADDING * 2, OG_HEIGHT - PADDING * 2, { fit: "inside", withoutEnlargement: false })
    .flatten({ background: "#ffffff" })
    .toBuffer();
  return sharp({ create: { width: OG_WIDTH, height: OG_HEIGHT, channels: 3, background: "#ffffff" } })
    .composite([{ input: packshot, gravity: "centre" }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

export async function serveProductOgImage(req: Request, res: Response): Promise<void> {
  const slug = String(req.params.slug ?? "").replace(/\.jpe?g$/i, "");
  if (!/^[A-Za-z0-9._~-]+$/.test(slug)) { res.status(404).type("text/plain").send("not found"); return; }
  try {
    const product = await getProductBySlug(slug);
    if (!product?.imageUrl) { res.status(404).type("text/plain").send("not found"); return; }
    const key = createHash("sha1").update(product.imageUrl).digest("hex").slice(0, 12);
    const file = join(CACHE_DIR, `${slug}-${key}.jpg`);
    let jpeg: Buffer;
    try {
      jpeg = await readFile(file);
    } catch {
      jpeg = await composeProductCard(product.imageUrl);
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, jpeg).catch(() => undefined);
    }
    res.status(200).set({ "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800", "Content-Length": String(jpeg.length) }).end(jpeg);
  } catch (error) {
    console.error(`[og] could not compose card for ${slug}`, error);
    res.status(503).type("text/plain").send("image unavailable");
  }
}
