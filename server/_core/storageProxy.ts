import type { Express, RequestHandler } from "express";
import { ENV } from "./env";

/**
 * Serves the "/cdn/{key}" URL shape saved throughout the database (product
 * images, site media, avatars, the favicon in index.html) and hard-coded as
 * a fallback path in a few components. This is a thin redirect to SUGI's own
 * Cloudflare R2 bucket -- the key itself never contains any prefix, so
 * renaming this route touches nothing in R2 (see below).
 *
 * Tom, 2026-09-05 (explicit, "remove manus storage use"): this route used to
 * be "/manus-storage/{key}" -- a leftover name from the original Manus-hosted
 * deployment, kept post-migration purely so already-saved DB URLs wouldn't
 * need a rewrite. Storage itself has been 100% Cloudflare R2 for a long time
 * (see docs/PROJECT-GUIDE.md) -- "manus-storage" was never anything but a URL path
 * string, not a real remaining dependency. Renamed to a vendor-neutral "/cdn/"
 * (not "/r2-storage/") so a future storage migration doesn't repeat this
 * exact problem. All 541 existing DB rows referencing the old prefix were
 * migrated to the new one in the same pass (see git history) -- the old
 * route stays registered below purely as a zero-cost safety net for any URL
 * this migration missed (an external bookmark, a cached page), not because
 * anything in this app still writes or reads it going forward.
 */
// 2026-09-27: this route redirected ANY key in the bucket to R2's public URL
// -- including `applications/<random>/<name>.pdf` (server/routers.ts, the
// careers page's CV upload), which is not meant to be public: an admin-only
// download, not something to hand out to anyone who happens to have or guess
// the key. Every other prefix in this bucket (product images, site media,
// avatars) is genuinely public content.
const NON_PUBLIC_KEY_PREFIXES = ["applications/", "inventory/receipts/"];

/**
 * `/cdn/<key>` зам дахь key аюулгүй эсэх: `..`/`.`/хоосон сегмент, `\`, эхний `/`,
 * хяналтын тэмдэгт агуулсан key-г татгалзана (угтвар шалгалтыг `a/../applications/x`
 * маягаар тойрч, эсвэл R2/CDN-ийн замыг normalise хийхэд ашиглуулахгүй).
 */
export function isSafeStorageKey(key: string): boolean {
  if (!key || key.startsWith("/") || key.includes("\\")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(key)) return false;
  return key.split("/").every(segment => segment !== "" && segment !== "." && segment !== "..");
}

export function isPublicStorageKey(key: string): boolean {
  return !NON_PUBLIC_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
}

export function registerStorageProxy(app: Express) {
  const redirectToR2: RequestHandler = (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) return res.status(400).send("Missing storage key.");
    if (!isSafeStorageKey(key) || !isPublicStorageKey(key)) {
      return res.status(404).type("text/plain").send("not found");
    }
    if (!ENV.s3PublicBaseUrl) {
      return res.status(503).send("Storage is not configured yet. Set S3_PUBLIC_BASE_URL.");
    }
    // Frontend performance audit (2026-09-02): storage.ts's appendHashSuffix
    // gives every stored key a random hash, so a given key's target content
    // never changes -- same "content-hashed, safe to cache forever"
    // property as Vite's build output. Cache-Control is respected on
    // redirect responses per RFC 7231, not just 200s, so a cache hit here
    // skips this server entirely on a repeat visit.
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.redirect(302, `${ENV.s3PublicBaseUrl}/${key}`);
  };
  app.get("/cdn/*", redirectToR2);
  app.get("/manus-storage/*", redirectToR2);
}
