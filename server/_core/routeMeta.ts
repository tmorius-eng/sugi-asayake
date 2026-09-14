/**
 * Per-route <head> values for the two page kinds people actually share:
 * a product and a journal post (2026-09-14, Tom: "share hiihed ter platform
 * deer n ter baraanii zuragn haragdag baih ystoi").
 *
 * The SPA renders every route from one index.html, and until now that
 * document carried the SAME og:image (the homepage hero) for every URL --
 * so a product link pasted into Facebook or Messenger showed the hero, not
 * the product. Crawlers never run the app's JavaScript; the only place a
 * product's own title, image and price can live is the HTML the server
 * sends. This module resolves those values for the path being served and
 * indexHtml.ts substitutes them over the site-wide defaults.
 *
 * Also carries the structured data Google Shopping reads (schema.org
 * Product with an Offer in MNT, plus AggregateRating when there are
 * reviews) and, as a side effect, preloads the product image so the PDP's
 * largest paint starts with the document, the same trick the homepage hero
 * already uses.
 *
 * Cached per path for a minute -- a shared link tends to be opened by many
 * crawlers and people in a short burst.
 */
import { getProductBySlug, getPublishedPostBySlug } from "../db";
import { getOrSetCached } from "./ttlCache";
import { ENV } from "./env";
import { escapeAttribute } from "./indexHtml";

const CACHE_TTL_MS = 60_000;

export type RouteMeta = Map<string, string>;

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const clip = (text: string, max = 200) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function absoluteUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = (ENV.publicBaseUrl || "https://sugiasayake.mn").replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** Site-relative image URLs on /cdn/ are redirected to R2; crawlers follow that fine, but an absolute URL is required. */
async function productMeta(slug: string, siteName: string): Promise<RouteMeta | null> {
  const product = await getProductBySlug(slug);
  if (!product) return null;
  const description = clip(stripHtml(product.shortDescription || product.description || `${product.name} — ${siteName}`));
  const image = absoluteUrl(product.imageUrl);
  const url = absoluteUrl(`/product/${product.slug}`);
  const title = `${product.name} — ${siteName}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(image ? { image: [image] } : {}),
    description,
    sku: product.sku,
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(/^\d{8,14}$/.test(product.sku) ? { gtin: product.sku } : {}),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "MNT",
      price: product.priceMnt,
      availability: product.stockQuantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
    ...(product.reviewCount > 0 && product.avgRating
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(product.avgRating).toFixed(1), reviewCount: product.reviewCount } }
      : {}),
  };
  return new Map<string, string>([
    ["SEO_TITLE", escapeAttribute(title)],
    ["SEO_DESCRIPTION", escapeAttribute(description)],
    ["SEO_OG_DESCRIPTION", escapeAttribute(description)],
    ["SEO_TWITTER_DESCRIPTION", escapeAttribute(description)],
    ["SEO_OG_TYPE", "product"],
    ["SEO_CANONICAL", escapeAttribute(url)],
    ...(image ? [["SEO_OG_IMAGE", escapeAttribute(image)] as [string, string]] : []),
    ["SEO_STRUCTURED_DATA", jsonLd(structuredData)],
    // The product photo is the PDP's largest paint; start fetching it with the document.
    ["SEO_HERO_PRELOAD", product.imageUrl ? `<link rel="preload" as="image" href="${escapeAttribute(product.imageUrl)}" fetchpriority="high" />` : ""],
  ]);
}

async function postMeta(slug: string, siteName: string): Promise<RouteMeta | null> {
  const post = await getPublishedPostBySlug(slug);
  if (!post) return null;
  const description = clip(stripHtml(post.metaDescription || post.excerpt || post.content || ""));
  const image = absoluteUrl(post.coverImageUrl);
  const url = absoluteUrl(`/${post.slug}`);
  const title = `${post.metaTitle || post.title} — ${siteName}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    ...(image ? { image: [image] } : {}),
    description,
    ...(post.publishedAt ? { datePublished: new Date(post.publishedAt).toISOString() } : {}),
    dateModified: new Date(post.updatedAt).toISOString(),
    mainEntityOfPage: url,
    publisher: { "@type": "Organization", name: siteName },
  };
  return new Map<string, string>([
    ["SEO_TITLE", escapeAttribute(title)],
    ["SEO_DESCRIPTION", escapeAttribute(description)],
    ["SEO_OG_DESCRIPTION", escapeAttribute(description)],
    ["SEO_TWITTER_DESCRIPTION", escapeAttribute(description)],
    ["SEO_OG_TYPE", "article"],
    ["SEO_CANONICAL", escapeAttribute(url)],
    ...(image ? [["SEO_OG_IMAGE", escapeAttribute(image)] as [string, string]] : []),
    ["SEO_STRUCTURED_DATA", jsonLd(structuredData)],
    ["SEO_HERO_PRELOAD", ""],
  ]);
}

/**
 * Values that override the site-wide ones for this path, or null for
 * every route that keeps the defaults (home, /shop, legal pages, admin...).
 * Never throws: a database hiccup degrades the preview, not the page.
 */
export async function resolveRouteMeta(pathname: string, siteName: string): Promise<RouteMeta | null> {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  const product = path.match(/^\/product\/([A-Za-z0-9._~-]+)$/);
  const post = !product && path.match(/^\/([A-Za-z0-9._~-]+)$/);
  if (!product && !post) return null;
  // /shop, /brands, /login... are single-segment too: PostDetail is the
  // catch-all route, but only a real published post has a preview.
  try {
    return await getOrSetCached(`routeMeta:${path}`, CACHE_TTL_MS, async () =>
      product ? productMeta(product[1], siteName) : postMeta((post as RegExpMatchArray)[1], siteName));
  } catch (error) {
    console.error(`[seo] Could not resolve route meta for ${path}`, error);
    return null;
  }
}
