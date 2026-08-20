import type { Express } from "express";
import { ENV } from "./env";

/**
 * Serves the "/manus-storage/{key}" URL shape that is already saved throughout
 * the database (product images, site media, the favicon in index.html) and
 * hard-coded as a fallback path in a couple of components. Keeping the same
 * URL shape means none of that has to change — this route just now points at
 * SUGI's own S3 bucket instead of Manus's Forge proxy.
 *
 * NOTE: image bytes uploaded through the old Manus-hosted deployment live in
 * Manus's storage, not this bucket. Existing image URLs will 404 here until
 * those files are copied into the new bucket under the same key, or the
 * corresponding products / site-media slots are re-uploaded through /admin.
 */
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) return res.status(400).send("Missing storage key.");
    if (!ENV.s3PublicBaseUrl) {
      return res.status(503).send("Storage is not configured yet. Set S3_PUBLIC_BASE_URL.");
    }
    res.redirect(302, `${ENV.s3PublicBaseUrl}/${key}`);
  });
}
