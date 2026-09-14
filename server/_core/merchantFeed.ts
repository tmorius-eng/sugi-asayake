/**
 * Google Merchant Center product feed -- /feeds/google-merchant.xml
 * (2026-09-14).
 *
 * RSS 2.0 with the g: namespace, the format Merchant Center's "scheduled
 * fetch" reads directly from a URL, so listing the catalogue on Google
 * Shopping needs no upload step: paste this URL once. Every published
 * product, from the same query the storefront uses, cached for ten
 * minutes like the sitemap.
 *
 * Field choices: `price` is "<amount> MNT" (Merchant Center wants the ISO
 * code, not ₮); `gtin` is the SKU only when it is a real 8-14 digit barcode
 * (the POS export uses the barcode as SKU, but a few are hand-typed);
 * `availability` follows stockQuantity; `product_type` is the shop's own
 * category name (google_product_category is optional and best set in
 * Merchant Center's own rules). Descriptions are HTML-stripped and cut at
 * 5000 characters, the feed limit.
 */
import type { Request, Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { productCategories, products } from "../../drizzle/schema";
import { getSiteTextSlot } from "../../shared/site-text";
import { getOrSetCached } from "./ttlCache";
import { ENV } from "./env";

const CACHE_KEY = "feed:google-merchant";
const CACHE_TTL_MS = 10 * 60 * 1000;

const xmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function originFor(req: Request): string {
  if (ENV.publicBaseUrl) return ENV.publicBaseUrl.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

const absolute = (origin: string, url: string | null | undefined) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
};

export async function buildMerchantFeed(origin: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  // Own query rather than the storefront's catalogRowColumns: the feed
  // needs `sku` (the barcode) and none of the review aggregates.
  const rows = await db
    .select({
      id: products.id, name: products.name, slug: products.slug, brand: products.brand, sku: products.sku,
      shortDescription: products.shortDescription, priceMnt: products.priceMnt, compareAtPriceMnt: products.compareAtPriceMnt,
      imageUrl: products.imageUrl, stockQuantity: products.stockQuantity, categoryName: productCategories.name,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    // Gift cards (2026-09-14) are out: Merchant Center has its own rules
    // for them and they carry no GTIN, brand or photo of a real item.
    .where(and(eq(products.isPublished, true), eq(products.kind, "physical")))
    .orderBy(asc(products.id));
  const siteName = getSiteTextSlot("seo-text-site-name").fallbackValue;
  const items = rows
    .filter(row => row.imageUrl) // Merchant Center rejects items without an image_link
    .map(row => {
      const link = `${origin}/product/${row.slug}`;
      const description = stripHtml(row.shortDescription || row.name).slice(0, 5000);
      const gtin = /^\d{8,14}$/.test(row.sku ?? "") ? row.sku : null;
      return [
        "<item>",
        `<g:id>${xmlEscape(String(row.id))}</g:id>`,
        `<g:title>${xmlEscape(row.name)}</g:title>`,
        `<g:description>${xmlEscape(description)}</g:description>`,
        `<g:link>${xmlEscape(link)}</g:link>`,
        `<g:image_link>${xmlEscape(absolute(origin, row.imageUrl))}</g:image_link>`,
        `<g:availability>${row.stockQuantity > 0 ? "in_stock" : "out_of_stock"}</g:availability>`,
        // A struck-through "old price" is the regular price to Google; the live one is the sale price.
        ...(row.compareAtPriceMnt && row.compareAtPriceMnt > row.priceMnt
          ? [`<g:price>${row.compareAtPriceMnt} MNT</g:price>`, `<g:sale_price>${row.priceMnt} MNT</g:sale_price>`]
          : [`<g:price>${row.priceMnt} MNT</g:price>`]),
        ...(row.brand ? [`<g:brand>${xmlEscape(row.brand)}</g:brand>`] : []),
        ...(gtin ? [`<g:gtin>${gtin}</g:gtin>`] : [`<g:identifier_exists>no</g:identifier_exists>`]),
        `<g:condition>new</g:condition>`,
        ...(row.categoryName ? [`<g:product_type>${xmlEscape(row.categoryName)}</g:product_type>`] : []),
        "</item>",
      ].join("");
    });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
    `<channel>`,
    `<title>${xmlEscape(siteName || "SUGI ASAYAKE")}</title>`,
    `<link>${xmlEscape(origin)}</link>`,
    `<description>${xmlEscape(`${siteName || "SUGI ASAYAKE"} — product feed`)}</description>`,
    ...items,
    `</channel>`,
    `</rss>`,
  ].join("\n");
}

export async function serveMerchantFeed(req: Request, res: Response): Promise<void> {
  const origin = originFor(req);
  try {
    const xml = await getOrSetCached(`${CACHE_KEY}:${origin}`, CACHE_TTL_MS, () => buildMerchantFeed(origin));
    res.status(200).set({ "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600" }).send(xml);
  } catch (error) {
    console.error("[feed] Could not build the merchant feed", error);
    res.status(503).set({ "Content-Type": "text/plain" }).send("feed unavailable");
  }
}
