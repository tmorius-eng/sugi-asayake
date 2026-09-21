/**
 * Google Merchant Center-ийн барааны feed — /feeds/google-merchant.xml
 * (2026-09-14).
 *
 * g: namespace-тэй RSS 2.0 — Merchant Center-ийн "scheduled fetch" URL-ээс шууд
 * уншдаг формат, тиймээс каталогийг Google Shopping-д гаргахад upload алхам
 * хэрэггүй: энэ URL-ийг нэг удаа өгнө. Нийтлэгдсэн бараа бүр, storefront-ийн
 * ашигладаг ижил query-ээс, sitemap шиг 10 минут кэшлэгдэнэ.
 *
 * Талбарын сонголт: `price` нь "<amount> MNT" (Merchant Center ₮ биш ISO код
 * хүсдэг); `gtin` зөвхөн SKU бодит 8-14 оронтой баркод үед (POS export баркодыг
 * SKU болгодог ч цөөн хэд гараар бичигдсэн); `availability` stockQuantity-г дагана;
 * `product_type` дэлгүүрийн өөрийн ангиллын нэр (google_product_category сонголттой,
 * Merchant Center-ийн дүрмээр тавих нь дээр). Тайлбар HTML-гүй, feed-ийн хязгаар
 * 5000 тэмдэгтээр таслагдана.
 */
import type { Request, Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { getDb, getSiteName } from "../db";
import { productCategories, products } from "../../drizzle/schema";
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
  // 2026-09-20: энэ мөр `fallbackValue`-г уншдаг байсан нь алдаа байв — эзэн
  // /admin-аас дэлгүүрийн нэрээ сольсон ч Google Merchant feed хуучин нэрээр
  // гарсаар байв. Бусад бүх газартай ижил "DB override, код fallback".
  const siteName = await getSiteName();
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
    `<title>${xmlEscape(siteName)}</title>`,
    `<link>${xmlEscape(origin)}</link>`,
    `<description>${xmlEscape(`${siteName} — product feed`)}</description>`,
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
