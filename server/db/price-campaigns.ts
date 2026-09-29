// server/db/price-campaigns.ts — Бүх барааны нийтийн хямдрал (2026-09-29, migration 0098).
//
// DB-ийн барааны үнэ хэзээ ч өөрчлөгдөхгүй: идэвхтэй хямдралыг үнэ уншдаг газар
// бүрт `withLiveCampaign()`-оор хэрэглэнэ (кэшээс уншсаны ДАРАА — тиймээс эхлэх,
// дуусах мөч кэшийн TTL-ээс үл хамааран яг тухайн хүсэлт дээр шийдэгдэнэ).
// Дүрэм: shared/price-campaign.ts. Tom-ийн шийдвэр: docs/SITEWIDE-SALE-PLAN.md.

import { and, desc, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import { priceCampaigns } from "../../drizzle/schema";
import { getOrSetCached, invalidateCached, invalidateCachedByPrefix } from "../_core/ttlCache";
import { applyCampaignToRows, campaignPriceFor, isCampaignLive, PRICE_CAMPAIGN_MAX_PERCENT, PRICE_CAMPAIGN_MIN_PERCENT, type PriceCampaignWindow } from "../../shared/price-campaign";
import { getDb } from "./connection";
import { getPublishedCatalog } from "./catalog";

const CAMPAIGNS_CACHE_KEY = "storefront:priceCampaigns";
const CAMPAIGNS_CACHE_TTL_MS = 30_000;

/**
 * Хүснэгт байхгүй үед уншилт хямдралгүй буцна. ⚠️ Гэхдээ 0098-гүй DB дээр захиалга
 * БИЧИХ зам ажиллахгүй (drizzle INSERT схемийн бүх баганыг — `orders.priceCampaignId`,
 * `order_items.listPriceMnt` — нэрлэдэг). Тиймээс 0098-ийг кодоос ӨМНӨ ажиллуулна.
 */
function isMissingTableError(error: unknown): boolean {
  const text = String((error as { cause?: { code?: string; message?: string } })?.cause?.code ?? "")
    + String((error as { cause?: { message?: string } })?.cause?.message ?? (error as Error)?.message ?? "");
  return /ER_NO_SUCH_TABLE|price_campaigns' doesn't exist/.test(text);
}

/** Дуусаагүй, зогсоогоогүй хямдралууд (идэвхтэй + удахгүй эхлэх). Эхлэх мөчийг хүсэлт бүр өөрөө шалгана. */
async function getUpcomingCampaigns(): Promise<PriceCampaignWindow[]> {
  return getOrSetCached(CAMPAIGNS_CACHE_KEY, CAMPAIGNS_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    try {
      return await db.select({ id: priceCampaigns.id, percentOff: priceCampaigns.percentOff, startsAt: priceCampaigns.startsAt, endsAt: priceCampaigns.endsAt, stoppedAt: priceCampaigns.stoppedAt })
        .from(priceCampaigns)
        .where(and(isNull(priceCampaigns.stoppedAt), gt(priceCampaigns.endsAt, sql`NOW()`)))
        .orderBy(priceCampaigns.startsAt);
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  });
}

/** Яг одоо идэвхтэй хямдрал (давхцал хориглогдсон тул нэгээс илүүгүй). */
export async function getLivePriceCampaign(now: Date = new Date()): Promise<PriceCampaignWindow | null> {
  const campaigns = await getUpcomingCampaigns();
  return campaigns.find(campaign => isCampaignLive(campaign, now)) ?? null;
}

/**
 * Үнэтэй мөрүүдэд идэвхтэй хямдралыг хэрэглэнэ — ШИНЭ объектууд, кэштэй массив
 * хөндөгдөхгүй. Хямдралгүй үед анхны массивыг шууд буцаана.
 */
export async function withLiveCampaign<T extends { priceMnt: number; compareAtPriceMnt?: number | null; kind?: string | null }>(rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const live = await getLivePriceCampaign();
  return live ? applyCampaignToRows(rows, live) : rows;
}

/** Нэг мөрийн хувилбар (null-safe). */
export async function withLiveCampaignOne<T extends { priceMnt: number; compareAtPriceMnt?: number | null; kind?: string | null }>(row: T | null): Promise<T | null> {
  if (!row) return row;
  const [priced] = await withLiveCampaign([row]);
  return priced ?? row;
}

/**
 * Захиалгын мөр бичихэд: идэвхтэй хямдрал ба мөр бүрийн төлөх/анхны үнэ.
 * `listPriceMnt` зөвхөн хямдарсан мөрөнд (тайлан).
 */
export async function priceLinesForOrder<T extends { priceMnt: number; compareAtPriceMnt?: number | null; kind?: string | null }>(lines: T[]): Promise<{ campaignId: number | null; lines: Array<T & { listPriceMnt: number | null }> }> {
  const live = await getLivePriceCampaign();
  if (!live) return { campaignId: null, lines: lines.map(line => ({ ...line, listPriceMnt: null })) };
  let any = false;
  const priced = lines.map(line => {
    const next = campaignPriceFor(line, live.percentOff);
    if (!next.discounted) return { ...line, listPriceMnt: null };
    any = true;
    return { ...line, priceMnt: next.priceMnt, compareAtPriceMnt: next.compareAtPriceMnt, listPriceMnt: line.priceMnt };
  });
  return { campaignId: any ? live.id : null, lines: priced };
}

export function invalidatePriceCampaigns(): void {
  invalidateCached(CAMPAIGNS_CACHE_KEY);
  // Google feed-ийн XML (10 мин кэш) хямдралын үнийг агуулдаг — зогсоох/засахад шууд шинэчлэгдэнэ.
  invalidateCachedByPrefix("feed:google-merchant");
}

// ---------------------------------------------------------------------------
// Admin (зөвхөн adminProcedure-оос дуудагдана).
// ---------------------------------------------------------------------------

export type PriceCampaignInput = { name: string; percentOff: number; startsAt: Date; endsAt: Date };

function assertCampaignShape(input: PriceCampaignInput) {
  if (!Number.isInteger(input.percentOff) || input.percentOff < PRICE_CAMPAIGN_MIN_PERCENT || input.percentOff > PRICE_CAMPAIGN_MAX_PERCENT) {
    throw new Error(`Хямдралын хувь ${PRICE_CAMPAIGN_MIN_PERCENT}–${PRICE_CAMPAIGN_MAX_PERCENT} хооронд бүхэл тоо байна.`);
  }
  if (!(input.endsAt.getTime() > input.startsAt.getTime())) throw new Error("Дуусах цаг эхлэх цагаас хойш байх ёстой.");
  if (input.endsAt.getTime() <= Date.now()) throw new Error("Дуусах цаг өнгөрсөн байна.");
}

async function assertNoOverlap(input: PriceCampaignInput, excludeId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [overlap] = await db.select({ id: priceCampaigns.id, name: priceCampaigns.name }).from(priceCampaigns)
    .where(and(
      isNull(priceCampaigns.stoppedAt),
      lt(priceCampaigns.startsAt, input.endsAt),
      gt(priceCampaigns.endsAt, input.startsAt),
      excludeId === null ? undefined : ne(priceCampaigns.id, excludeId),
    )).limit(1);
  if (overlap) throw new Error(`"${overlap.name}" хямдралтай хугацаа давхцаж байна — нэг зэрэг хоёр нийтийн хямдрал байж болохгүй.`);
}

export async function listPriceCampaigns() {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(priceCampaigns).orderBy(desc(priceCampaigns.startsAt), desc(priceCampaigns.id)).limit(100);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function createPriceCampaign(input: PriceCampaignInput & { actorUserId: number }) {
  assertCampaignShape(input);
  await assertNoOverlap(input, null);
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(priceCampaigns).values({
    name: input.name.trim(), percentOff: input.percentOff, startsAt: input.startsAt, endsAt: input.endsAt,
    createdByUserId: input.actorUserId, updatedByUserId: input.actorUserId,
  });
  invalidatePriceCampaigns();
  const [row] = await db.select().from(priceCampaigns).where(eq(priceCampaigns.id, Number(inserted[0].insertId))).limit(1);
  return row;
}

export async function updatePriceCampaign(input: { id: number; actorUserId: number } & PriceCampaignInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [existing] = await db.select().from(priceCampaigns).where(eq(priceCampaigns.id, input.id)).limit(1);
  if (!existing) throw new Error("Хямдрал олдсонгүй.");
  if (existing.stoppedAt) throw new Error("Зогсоосон хямдралыг засахгүй — шинээр үүсгэнэ үү.");
  assertCampaignShape(input);
  await assertNoOverlap(input, input.id);
  await db.update(priceCampaigns).set({
    name: input.name.trim(), percentOff: input.percentOff, startsAt: input.startsAt, endsAt: input.endsAt,
    updatedByUserId: input.actorUserId, updatedAt: new Date(),
  }).where(eq(priceCampaigns.id, input.id));
  invalidatePriceCampaigns();
  const [row] = await db.select().from(priceCampaigns).where(eq(priceCampaigns.id, input.id)).limit(1);
  return row;
}

/** Одоо зогсооно (guarded) — үнэ шууд анхных руугаа буцна. */
export async function stopPriceCampaign(input: { id: number; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.update(priceCampaigns).set({ stoppedAt: new Date(), updatedByUserId: input.actorUserId, updatedAt: new Date() })
    .where(and(eq(priceCampaigns.id, input.id), isNull(priceCampaigns.stoppedAt)));
  if (Number(result[0].affectedRows ?? 0) !== 1) throw new Error("Хямдрал олдсонгүй эсвэл аль хэдийн зогссон.");
  invalidatePriceCampaigns();
  return { id: input.id };
}

/** Эхлээгүй хямдралыг л устгана — эхэлсэн бол захиалгын түүхэнд холбогдсон тул зогсооно. */
export async function deletePriceCampaign(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.delete(priceCampaigns).where(and(eq(priceCampaigns.id, id), gt(priceCampaigns.startsAt, sql`NOW()`)));
  if (Number(result[0].affectedRows ?? 0) !== 1) throw new Error("Эхэлсэн хямдралыг устгахгүй — оронд нь зогсооно уу.");
  invalidatePriceCampaigns();
  return { id };
}

/** Урьдчилан харах: хэдэн бараанд хамаарах, хэд нь алгасагдах, жишээ үнэ. */
export async function previewPriceCampaign(percentOff: number) {
  const rows = await getPublishedCatalog();
  const now = new Date();
  const probe: PriceCampaignWindow = { id: 0, percentOff, startsAt: new Date(now.getTime() - 1000), endsAt: new Date(now.getTime() + 60_000), stoppedAt: null };
  let affected = 0, alreadyDiscounted = 0, giftCards = 0;
  const examples: Array<{ id: number; name: string; fromMnt: number; toMnt: number }> = [];
  let lowestMnt: number | null = null;
  for (const row of rows) {
    if (row.kind === "gift_card") { giftCards += 1; continue; }
    if (row.compareAtPriceMnt != null && row.compareAtPriceMnt > row.priceMnt) { alreadyDiscounted += 1; continue; }
    const [priced] = applyCampaignToRows([row], probe, now);
    if (priced.priceMnt === row.priceMnt) continue;
    affected += 1;
    lowestMnt = lowestMnt === null ? priced.priceMnt : Math.min(lowestMnt, priced.priceMnt);
    if (examples.length < 6) examples.push({ id: row.id, name: row.name, fromMnt: row.priceMnt, toMnt: priced.priceMnt });
  }
  return { total: rows.length, affected, alreadyDiscounted, giftCards, lowestMnt, examples };
}
