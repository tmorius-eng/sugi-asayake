// SUGI-ийн өөрийн S3 (эсвэл S3-compatible: Cloudflare R2, Backblaze B2 г.м.) bucket
// дээрх объект хадгалалт. Upload бүрийг Manus платформоор дамжуулдаг байсан өмнөх
// "Forge" proxy-г орлоно.
//
// Шаардлагатай env: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
// S3_PUBLIC_BASE_URL. Сонголттой: S3_ENDPOINT (зөвхөн AWS бус S3-compatible
// провайдерт).

import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, HeadBucketCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { ENV } from "./_core/env";
import { avifVariantKey, gridVariantKey } from "../shared/image-variants";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) {
    throw new Error(
      "Storage config missing: set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_PUBLIC_BASE_URL)."
    );
  }
  _client = new S3Client({
    region: ENV.s3Region,
    endpoint: ENV.s3Endpoint,
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
  });
  return _client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function putObject(key: string, data: Buffer | Uint8Array | string, contentType: string) {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: typeof data === "string" ? Buffer.from(data) : data,
      ContentType: contentType,
      // Frontend performance audit (2026-09-02): appendHashSuffix already
      // gives every upload a random hash in its filename, so a re-upload
      // never reuses a URL for different content -- the same
      // "content-hashed, safe to cache forever" property Vite's build
      // output has. Previously no CacheControl was set at all, so R2
      // served every product/site-media photo with no caching directive.
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  await putObject(key, data, contentType);

  // "/cdn/{key}" URL shape the rest of the app stores and expects (see
  // server/_core/storageProxy.ts) -- renamed from "/manus-storage/" 2026-09-05.
  return { key, url: `/cdn/${key}` };
}

/**
 * Stores a full-size image plus its small grid derivative under ONE shared
 * random hash, so the derivative's key is derivable from the full one by
 * string transformation alone (see shared/image-variants.ts) -- no schema
 * column, no second lookup. Calling storagePut twice would give the two
 * files different hashes and break that derivation, which is the whole
 * reason this exists rather than two plain puts.
 *
 * Only the full-size URL is returned/stored; the grid variant is found by
 * gridVariantUrl() at render time.
 */
export async function storagePutImageVariants(
  relKey: string,
  variants: { full: Buffer; grid: Buffer; fullAvif?: Buffer; gridAvif?: Buffer },
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  await putObject(key, variants.full, "image/webp");
  await putObject(gridVariantKey(key), variants.grid, "image/webp");
  // 2026-09-21: зураг (photo) бол AVIF хоёр хувилбар нь WebP-тэй ИЖИЛ нэрээр,
  // зөвхөн өргөтгөл нь өөр (shared/image-variants.ts-ийн avifVariantUrl).
  // WebP-ийг ЭХЭЛЖ бичнэ: AVIF бичих үед алдаа гарвал WebP аль хэдийн бэлэн
  // тул зураг эвдрэхгүй, AVIF-гүй л үлдэнэ (ResponsivePicture WebP руу буцна).
  if (variants.fullAvif) await putObject(avifVariantKey(key), variants.fullAvif, "image/avif");
  if (variants.gridAvif) await putObject(avifVariantKey(gridVariantKey(key)), variants.gridAvif, "image/avif");
  return { key, url: `/cdn/${key}` };
}

/**
 * Writes one object at an EXACT key, with no hash suffix appended. Only for
 * repairing a derivative whose key is already determined by an existing
 * stored URL (see scripts/repair-image-grid-variants.ts) -- normal uploads
 * must go through storagePut/storagePutImageVariants so every new object
 * gets its own hash and can be cached immutably.
 */
export async function storagePutExactKey(
  relKey: string,
  data: Buffer,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  await putObject(key, data, contentType);
  return { key, url: `/cdn/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/cdn/${key}` };
}

// ---- Хувийн bucket (2026-10-01) --------------------------------------------
// CV болон барааны баримтын зураг нь нийтийн R2 bucket-д "нууц" key-тэй байсан ч
// bucket public-read тул key мэдсэн хэн ч уншдаг байв. S3_PRIVATE_BUCKET-д хадгалбал
// нийтийн URL огт байхгүй; зөвхөн админы үүсгэсэн богино хугацаатай гарын үсэгтэй URL.

export const PRIVATE_STORAGE_UNAVAILABLE_MSG = "Файл хадгалах хувийн сан тохируулагдаагүй байна. Түр хүлээгээд дахин оролдоно уу эсвэл дэлгүүртэй холбогдоно уу.";

export function isPrivateBucketConfigured(): boolean {
  return Boolean(ENV.s3PrivateBucket);
}

/** Шинэ хувийн файл хадгалж болох эсэх: хувийн bucket байгаа, эсвэл (зөвхөн dev-д) нийтийн bucket-д түр хадгална. */
export function canStorePrivately(): boolean {
  return isPrivateBucketConfigured() || process.env.NODE_ENV !== "production";
}

export async function storagePutPrivate(
  relKey: string,
  data: Buffer | Uint8Array,
  contentType = "application/octet-stream",
): Promise<{ key: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (!ENV.s3PrivateBucket) {
    // Fail closed: production-д нийтийн bucket руу хувийн файл бичихгүй.
    if (process.env.NODE_ENV === "production") throw new Error(PRIVATE_STORAGE_UNAVAILABLE_MSG);
    console.warn(`[storage] S3_PRIVATE_BUCKET тохируулаагүй — "${key}"-г нийтийн bucket-д хадгаллаа (зөвхөн dev).`);
    await putObject(key, data, contentType);
    return { key };
  }
  await getClient().send(new PutObjectCommand({
    Bucket: ENV.s3PrivateBucket,
    Key: key,
    Body: data,
    ContentType: contentType,
    CacheControl: "private, no-store",
  }));
  return { key };
}

function safeDownloadName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 80);
  return cleaned || undefined;
}

/**
 * Хувийн файлын 1 цагийн гарын үсэгтэй URL. Хувийн bucket-д байвал тэндээс; байхгүй
 * (move-private-objects.ts-ээс өмнөх хуучин объект) эсвэл bucket тохируулаагүй бол нийтийн
 * bucket-ийн гарын үсэгтэй URL руу буцна.
 */
export async function storageGetSignedUrlPrivate(relKey: string, options: { downloadName?: string } = {}): Promise<string> {
  const key = normalizeKey(relKey);
  const downloadName = safeDownloadName(options.downloadName);
  const disposition = downloadName ? `attachment; filename="${downloadName}"` : "attachment";
  const client = getClient();
  let bucket = ENV.s3Bucket;
  if (ENV.s3PrivateBucket) {
    try {
      await client.send(new HeadObjectCommand({ Bucket: ENV.s3PrivateBucket, Key: key }), { abortSignal: AbortSignal.timeout(10_000) });
      bucket = ENV.s3PrivateBucket;
    } catch (error) {
      // Зөвхөн "байхгүй" (зөөгдөөгүй хуучин объект) үед нийтийн bucket руу буцна. Бусад алдаа
      // (токены эрх хүрэлцэхгүй 403, timeout) нь тохиргооны асуудал — чимээгүй 404 холбоос
      // өгөхийн оронд шидэнэ (2026-10-01 шалгалт).
      const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status !== 404) throw error;
    }
  }
  const command = new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: disposition, ResponseCacheControl: "private, no-store" });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const client = getClient();
  const key = normalizeKey(relKey);
  const command = new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

// TIER 6: lightweight admin-panel "is storage reachable" check — a HeadBucket
// call, not a full upload, so it's cheap enough to run on every dashboard
// load. Never throws: reports the failure instead, so a down S3/MinIO never
// takes the admin panel itself down with it.
export async function storagePing(): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getClient();
    await client.send(new HeadBucketCommand({ Bucket: ENV.s3Bucket }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown storage error" };
  }
}

/**
 * Объект R2-д байгаа эсэх, 10 минут кэштэй (2026-09-21).
 *
 * Зөвхөн нэг газар хэрэгтэй: нүүрний hero-ийн `<link rel="preload">` нь
 * хөтчийн ЯГ ашиглах файлыг заах ёстой. AVIF хувилбар нь заавал биш
 * (shared/image-variants.ts) тул байхгүй үед AVIF preload хийвэл 404 +
 * WebP-г дахин татна — өөрөөр хэлбэл хурдасгах засвар удаашруулна.
 * Алдаа гарвал (R2 унтарсан, тохиргоогүй) "байхгүй" гэж үзнэ — WebP-ийн
 * аюулгүй замыг сонгоно.
 */
const existsCache = new Map<string, { value: boolean; at: number }>();
const EXISTS_TTL_MS = 10 * 60 * 1000;

export async function storageObjectExists(relKey: string): Promise<boolean> {
  // 2026-09-23: `getClient()` нь тохиргоогүй үед ШИДДЭГ бөгөөд тэр дуудалт
  // `.then(ok, fail)`-ийн ГАДНА байсан тул функцийн гэрээ ("алдаа гарвал
  // байхгүй гэж үзнэ") зөрчигдөж, уналт нь `hasAvif` → `renderHeroShell` →
  // `resolveValues` дамжин `renderIndexHtml`-ийн catch руу хүрдэг. Тэр catch
  // нь БҮХ утгыг (site text, promo, bootstrap, structured data, hero shell)
  // хаядаг тул S3-гүй орчинд нүүр хуудас чимээгүйгээр брэндийн анхдагчаар
  // зурагдаж, кэш ч ажиллахгүй бүх DB асуулга хүсэлт тутам дахин явна.
  if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) return false;
  const key = normalizeKey(relKey);
  const cached = existsCache.get(key);
  if (cached && Date.now() - cached.at < EXISTS_TTL_MS) return cached.value;
  const value = await getClient()
    .send(new HeadObjectCommand({ Bucket: ENV.s3Bucket, Key: key }), { abortSignal: AbortSignal.timeout(3000) })
    .then(() => true, () => false);
  if (existsCache.size > 500) existsCache.clear();
  existsCache.set(key, { value, at: Date.now() });
  return value;
}

/**
 * Объектыг устгана — best-effort, хэзээ ч шидэхгүй (2026-09-27). Хуучин avatar,
 * устгасан анкетын CV (хувь хүний мэдээлэл) өмнө нь R2-д мөнхөд үлддэг байв.
 */
export async function storageDelete(relKey: string): Promise<boolean> {
  if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) return false;
  const key = normalizeKey(relKey);
  if (!key) return false;
  // Bucket тус бүрийг БИЕ ДААН устгана: хувийн bucket-ийн алдаа (эрхгүй токен гэх мэт) нь
  // аль хэдийн амжилттай болсон нийтийн устгалтыг "амжилтгүй" гэж харуулах ёсгүй.
  const buckets = [ENV.s3Bucket, ...(ENV.s3PrivateBucket ? [ENV.s3PrivateBucket] : [])];
  let deleted = false;
  for (const bucket of buckets) {
    try {
      // байхгүй объект устгах нь S3/R2-д алдаа биш
      await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(10_000) });
      deleted = true;
    } catch (error) {
      console.warn(`[storage] delete failed for ${key} in ${bucket === ENV.s3Bucket ? "public" : "private"} bucket:`, error instanceof Error ? error.message : error);
    }
  }
  if (deleted) existsCache.delete(key);
  return deleted;
}
