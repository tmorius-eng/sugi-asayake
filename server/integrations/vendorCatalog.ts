import { and, eq, inArray, sql } from "drizzle-orm";
import { products, productVariants } from "../../drizzle/schema";
import { normaliseBarcode } from "../../shared/barcode";
import { getDb } from "../db";
import { resolveCodes } from "../inventory";
import type { InventorySyncProvider, VendorProduct } from "./inventorySync";

/**
 * The vendor's PRICES and LABEL TEXT, as a diff a person approves
 * (2026-09-15).
 *
 * Stock posts itself (see runPullSnapshot). Prices do not, and that asymmetry
 * is deliberate: a wrong stock figure is visible and self-correcting at the
 * next pull, while a wrong price is money the shop either loses on every
 * order or prices itself out of the market with, silently, until someone
 * notices. So this module only ever REPORTS differences; applying them takes
 * an explicit list of barcodes from a human click.
 *
 * The client never sends values, only which barcodes to apply. The server
 * re-fetches from the vendor and writes the vendor's own numbers, so a
 * tampered request cannot set an arbitrary price.
 */
async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export type PriceDiffRow = {
  sku: string;
  productId: number;
  variantId: number;
  name: string;
  ourPriceMnt: number;
  ourCompareAtMnt: number | null;
  vendorPriceMnt: number;
  vendorBasePriceMnt: number | null;
  /** Percent the vendor's price differs from ours, signed. */
  deltaPercent: number;
  discountPercent: number | null;
  upcoming: { beginDate: string | null; percent: number | null }[];
  /** False when the product has other variants, so only the variant is priced. */
  pricesWholeProduct: boolean;
};

export type FactField = "ingredients" | "usageInstructions" | "warnings";
export type FactDiffRow = {
  sku: string;
  productId: number;
  name: string;
  field: FactField;
  /** Truncated for the table; the write always uses the vendor's full text. */
  ourValue: string | null;
  vendorValue: string;
  factsSource: string | null;
};

export type VendorCatalogDiff = {
  fetchedAt: Date;
  products: number;
  matched: number;
  priceRows: PriceDiffRow[];
  factRows: FactDiffRow[];
  /** Rows we deliberately never offer, with the reason -- shown as a count. */
  adminEditedFacts: number;
};

const FACT_FIELDS: { field: FactField; of: (product: VendorProduct) => string | null }[] = [
  { field: "ingredients", of: product => product.facts.ingredients },
  { field: "usageInstructions", of: product => product.facts.usageInstructions },
  { field: "warnings", of: product => product.facts.warnings },
];

/** The price the vendor would actually ring up, discount included. */
export function vendorEffectivePrice(product: VendorProduct): { price: number | null; compareAt: number | null; discountPercent: number | null } {
  const base = product.basePriceMnt ?? product.priceMnt;
  const listed = product.priceMnt ?? product.basePriceMnt;
  if (listed === null) return { price: null, compareAt: null, discountPercent: null };
  const discount = product.activeDiscount;
  if (!discount) return { price: listed, compareAt: base !== null && base > listed ? base : null, discountPercent: null };
  const afterPercent = discount.percent ? Math.round(listed * (1 - discount.percent / 100)) : listed;
  const afterAmount = discount.amountMnt ? Math.max(0, listed - discount.amountMnt) : listed;
  const price = Math.max(0, Math.min(afterPercent, afterAmount));
  // A discount that would price something at zero is a data problem, not a
  // giveaway: keep the list price and let the row show the discount instead.
  if (price <= 0) return { price: listed, compareAt: base !== null && base > listed ? base : null, discountPercent: discount.percent };
  return { price, compareAt: listed, discountPercent: discount.percent ?? Math.round(((listed - price) / listed) * 100) };
}

/** Our side of the comparison, keyed by normalised barcode. */
async function ourRows(skus: string[]) {
  const resolved = await resolveCodes(skus);
  const variantIds = Array.from(new Set(resolved.values()));
  const db = await requireDb();
  // One return path on purpose: an early exit typed as `never` compiles and
  // then hands the caller undefined fields at runtime.
  const rows = !variantIds.length ? [] : await db.select({
    variantId: productVariants.id,
    productId: productVariants.productId,
    variantPriceMnt: productVariants.priceMnt,
    variantCompareAtMnt: productVariants.compareAtPriceMnt,
    isDefault: productVariants.isDefault,
    productName: products.name,
    productPriceMnt: products.priceMnt,
    productCompareAtMnt: products.compareAtPriceMnt,
    ingredients: products.ingredients,
    usageInstructions: products.usageInstructions,
    warnings: products.warnings,
    factsSource: products.factsSource,
  }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(inArray(productVariants.id, variantIds));
  const byVariant = new Map(rows.map(row => [row.variantId, row]));
  // How many variants each product has -- a price only propagates to
  // products.priceMnt when this barcode is the product's whole story.
  const productIds = Array.from(new Set(rows.map(row => row.productId)));
  const counts = productIds.length
    ? await db.select({ productId: productVariants.productId, total: sql<number>`count(*)` }).from(productVariants).where(inArray(productVariants.productId, productIds)).groupBy(productVariants.productId)
    : [];
  const variantCount = new Map(counts.map(row => [row.productId, Number(row.total)]));
  return { resolved, byVariant, variantCount };
}

export async function buildVendorCatalogDiff(provider: InventorySyncProvider): Promise<VendorCatalogDiff> {
  if (!provider.pullCatalogSnapshot) throw new Error("Энэ вендор барааны мэдээлэл дамжуулдаггүй.");
  const snapshot = await provider.pullCatalogSnapshot();
  const { resolved, byVariant, variantCount } = await ourRows(snapshot.products.map(product => product.sku));

  const priceRows: PriceDiffRow[] = [];
  const factRows: FactDiffRow[] = [];
  let matched = 0;
  let adminEditedFacts = 0;

  for (const product of snapshot.products) {
    const variantId = resolved.get(normaliseBarcode(product.sku));
    if (variantId === undefined) continue;
    const ours = byVariant.get(variantId);
    if (!ours) continue;
    matched++;

    const { price, compareAt, discountPercent } = vendorEffectivePrice(product);
    if (price !== null && price !== ours.variantPriceMnt) {
      priceRows.push({
        sku: product.sku,
        productId: ours.productId,
        variantId,
        name: ours.productName,
        ourPriceMnt: ours.variantPriceMnt,
        ourCompareAtMnt: ours.variantCompareAtMnt,
        vendorPriceMnt: price,
        vendorBasePriceMnt: compareAt,
        deltaPercent: ours.variantPriceMnt > 0 ? Math.round(((price - ours.variantPriceMnt) / ours.variantPriceMnt) * 100) : 0,
        discountPercent,
        upcoming: product.upcomingDiscounts.map(discount => ({ beginDate: discount.beginDate, percent: discount.percent })),
        pricesWholeProduct: (variantCount.get(ours.productId) ?? 1) === 1 || ours.isDefault,
      });
    }

    // A product a person has edited is off limits to the sync entirely --
    // the same rule scripts/enrich-products-from-open-facts.ts follows.
    if (ours.factsSource === "admin") {
      if (FACT_FIELDS.some(({ of }) => of(product))) adminEditedFacts++;
      continue;
    }
    for (const { field, of } of FACT_FIELDS) {
      const vendorValue = of(product);
      if (!vendorValue) continue;
      const ourValue = ours[field];
      if ((ourValue ?? "").trim() === vendorValue.trim()) continue;
      factRows.push({ sku: product.sku, productId: ours.productId, name: ours.productName, field, ourValue, vendorValue, factsSource: ours.factsSource });
    }
  }

  return { fetchedAt: snapshot.fetchedAt, products: snapshot.products.length, matched, priceRows, factRows, adminEditedFacts };
}

/**
 * Writes the vendor's own values for the chosen barcodes. Re-fetches rather
 * than trusting anything the client sent, so the only thing a caller decides
 * is WHICH rows move.
 */
export async function applyVendorCatalog(provider: InventorySyncProvider, input: { kind: "price" | "facts"; skus: string[]; actorUserId: number }) {
  const diff = await buildVendorCatalogDiff(provider);
  const wanted = new Set(input.skus.map(normaliseBarcode));
  const db = await requireDb();
  const changes: { sku: string; name: string; field: string; from: string | null; to: string }[] = [];

  if (input.kind === "price") {
    for (const row of diff.priceRows) {
      if (!wanted.has(normaliseBarcode(row.sku))) continue;
      await db.update(productVariants)
        .set({ priceMnt: row.vendorPriceMnt, compareAtPriceMnt: row.vendorBasePriceMnt })
        .where(eq(productVariants.id, row.variantId));
      // The shop's price lives in TWO places (products.priceMnt is what the
      // catalogue lists, product_variants.priceMnt is what a basket charges).
      // Writing only one leaves the storefront showing a price nobody pays.
      if (row.pricesWholeProduct) {
        await db.update(products)
          .set({ priceMnt: row.vendorPriceMnt, compareAtPriceMnt: row.vendorBasePriceMnt })
          .where(eq(products.id, row.productId));
      }
      changes.push({ sku: row.sku, name: row.name, field: "priceMnt", from: String(row.ourPriceMnt), to: String(row.vendorPriceMnt) });
    }
  } else {
    // Group by product: one update per product, however many fields moved.
    const byProduct = new Map<number, { sku: string; name: string; values: Partial<Record<FactField, string>> }>();
    for (const row of diff.factRows) {
      if (!wanted.has(normaliseBarcode(row.sku))) continue;
      const entry = byProduct.get(row.productId) ?? { sku: row.sku, name: row.name, values: {} };
      entry.values[row.field] = row.vendorValue;
      byProduct.set(row.productId, entry);
      changes.push({ sku: row.sku, name: row.name, field: row.field, from: row.ourValue, to: row.vendorValue.slice(0, 40) });
    }
    for (const [productId, entry] of byProduct) {
      await db.update(products)
        .set({ ...entry.values, factsSource: "smartsoftware" })
        .where(and(eq(products.id, productId), sql`(${products.factsSource} IS NULL OR ${products.factsSource} <> 'admin')`));
    }
  }

  return { applied: changes.length, changes: changes.slice(0, 50) };
}
