/**
 * sitemap.xml ба robots.txt (2026-09-13 нээлтийн аудит).
 *
 * Одоог хүртэл robots.txt нь sitemap хуучин Manus preview host дээр (8-р сараас
 * үхсэн) байна гэж crawler-т хэлдэг статик файл байсан бөгөөд sitemap огт байсангүй
 * — тиймээс Google-д 980 барааны хуудасны жагсаалт байсангүй. Хоёулаа энд DB-ээс,
 * каталогийн бусад уншилттай ижил 30 с storefront cache-тэй serve хийгдэнэ.
 *
 * Юу орох: storefront-ийн нийтийн route, нийтлэгдсэн ангилал бүр (сайтын өөрийн
 * холбодог /shop?category= шүүлтүүрийн URL-аар), нийтлэгдсэн бараа бүр сүүлийн
 * засвараа <lastmod>-оор, нийтлэгдсэн нийтлэл бүр. Нэвтрэлтийн ард, /admin доорх
 * юу ч биш.
 *
 * Абсолют origin тавигдсан бол PUBLIC_BASE_URL-ээс (production), эс бөгөөс
 * хүсэлтийн өөрийн host — tunnel домэйн, ирээдүйн sugiasayake.mn хоёулаа кодын
 * өөрчлөлтгүй зөв URL гаргана.
 */

import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { getDb, getPublishedCategories, getPublishedPosts } from "../db";
import { products } from "../../drizzle/schema";
import { getOrSetCached } from "./ttlCache";
import { ENV } from "./env";

const CACHE_KEY = "sitemap:entries";
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Public, crawlable pages that exist regardless of catalogue content. */
export const STATIC_ROUTES: readonly { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/shop", changefreq: "daily", priority: "0.9" },
  { path: "/brands", changefreq: "weekly", priority: "0.6" },
  { path: "/journal", changefreq: "weekly", priority: "0.6" },
  { path: "/track-order", changefreq: "monthly", priority: "0.3" },
  { path: "/help", changefreq: "monthly", priority: "0.5" },
  { path: "/about", changefreq: "monthly", priority: "0.4" },
  { path: "/careers", changefreq: "monthly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.2" },
  { path: "/terms", changefreq: "yearly", priority: "0.2" },
  { path: "/returns", changefreq: "yearly", priority: "0.2" },
];

export type SitemapEntry = { path: string; lastmod?: Date | null; changefreq?: string; priority?: string };

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Pure: entries + origin -> XML. Unit-tested in server/sitemap.test.ts. */
export function renderSitemap(origin: string, entries: readonly SitemapEntry[]): string {
  const base = origin.replace(/\/$/, "");
  const urls = entries.map(entry => {
    const parts = [`<loc>${escapeXml(base + entry.path)}</loc>`];
    if (entry.lastmod) parts.push(`<lastmod>${entry.lastmod.toISOString().slice(0, 10)}</lastmod>`);
    if (entry.changefreq) parts.push(`<changefreq>${entry.changefreq}</changefreq>`);
    if (entry.priority) parts.push(`<priority>${entry.priority}</priority>`);
    return `  <url>${parts.join("")}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/** Pure: the robots policy. Mirrors what the old static file disallowed,
 *  plus the API and every account-only page. */
export function renderRobots(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /checkout",
    "Disallow: /orders",
    "Disallow: /profile",
    "Disallow: /login",
    "Disallow: /forgot-password",
    "Disallow: /invite/",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

async function collectEntries(): Promise<SitemapEntry[]> {
  return getOrSetCached(CACHE_KEY, CACHE_TTL_MS, async () => {
    const entries: SitemapEntry[] = STATIC_ROUTES.map(route => ({ ...route }));
    const db = await getDb();
    if (!db) return entries;

    const categories = await getPublishedCategories();
    for (const category of categories) {
      entries.push({ path: `/shop?category=${encodeURIComponent(category.name)}`, changefreq: "daily", priority: "0.7" });
    }

    const rows = await db
      .select({ slug: products.slug, updatedAt: products.updatedAt })
      .from(products)
      .where(and(eq(products.isPublished, true)));
    for (const row of rows) {
      entries.push({ path: `/product/${encodeURIComponent(row.slug)}`, lastmod: row.updatedAt, changefreq: "weekly", priority: "0.8" });
    }

    const posts = await getPublishedPosts();
    for (const post of posts) {
      entries.push({ path: `/${encodeURIComponent(post.slug)}`, lastmod: post.publishedAt, changefreq: "monthly", priority: "0.5" });
    }
    return entries;
  });
}

/** Origin for absolute URLs: configured base, else this request's host. */
export function publicOrigin(req: Request): string {
  return (ENV.publicBaseUrl || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

export async function serveSitemap(req: Request, res: Response): Promise<void> {
  try {
    const entries = await collectEntries();
    res.status(200).set({ "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600" }).send(renderSitemap(publicOrigin(req), entries));
  } catch (error) {
    console.error("[sitemap] could not build sitemap", error instanceof Error ? error.message : error);
    // Static routes only rather than a 500: a crawler that gets an error
    // backs off for days; a short sitemap it will revisit tomorrow.
    res.status(200).set({ "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-cache" }).send(renderSitemap(publicOrigin(req), STATIC_ROUTES));
  }
}

export function serveRobots(req: Request, res: Response): void {
  res.status(200).set({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }).send(renderRobots(publicOrigin(req)));
}
