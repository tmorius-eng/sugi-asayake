/**
 * Бүх барааны нийтийн хямдрал (2026-09-29, docs/SITEWIDE-SALE-PLAN.md).
 *
 * Tom-ийн шийдвэр: бүх бараа (бэлгийн карт хасагдана — тэр нь мөнгө); аль хэдийн
 * хямдралтай (хуучин үнэтэй) бараа ХЭВЭЭР; купон, гишүүнчлэл дээр нь нэмэгдэнэ;
 * касс, гар захиалгад ч хэрэглэгдэнэ; үнэ 100₮ хүртэл энгийнээр бөөрөнхийлнө;
 * зөвхөн admin асааж/унтрааж/засна.
 *
 * DB-ийн үнэ хэзээ ч өөрчлөгдөхгүй — сервер үнэ уншдаг газар бүрт `priceMnt`-ийг
 * хямдарсан үнээр, `compareAtPriceMnt`-ийг анхны үнээр СОЛЬЖ буцаана. Клиентийн
 * зураастай үнэ ба "-X%" нь өөрчлөлтгүйгээр ажиллана.
 */

export type PriceCampaignWindow = {
  id: number;
  percentOff: number;
  startsAt: Date;
  endsAt: Date;
  stoppedAt: Date | null;
};

export const PRICE_CAMPAIGN_MIN_PERCENT = 1;
export const PRICE_CAMPAIGN_MAX_PERCENT = 90;
/** Хямдарсан үнийг энэ алхмаар бөөрөнхийлнө (энгийн: 50₮ ба түүнээс дээш бол дээш). */
export const PRICE_CAMPAIGN_ROUNDING_MNT = 100;

export function isCampaignLive(campaign: PriceCampaignWindow | null | undefined, now: Date = new Date()): boolean {
  if (!campaign || campaign.stoppedAt) return false;
  const t = now.getTime();
  return campaign.startsAt.getTime() <= t && t < campaign.endsAt.getTime();
}

/**
 * Нэг мөрийн хямдарсан үнэ. Хөндөхгүй тохиолдол: бэлгийн карт, аль хэдийн
 * хямдралтай (compareAt > price), үнэ 0, хувь буруу. Бөөрөнхийлсний дараа анхны
 * үнээс ИХ, 0-ээс БАГА болохгүй; бөөрөнхийлөлт үнийг 0 болговол бөөрөнхийлөхгүй.
 */
export function campaignPriceFor(
  row: { priceMnt: number; compareAtPriceMnt?: number | null; kind?: string | null },
  percentOff: number,
): { priceMnt: number; compareAtPriceMnt: number | null; discounted: boolean } {
  const original = { priceMnt: row.priceMnt, compareAtPriceMnt: row.compareAtPriceMnt ?? null, discounted: false };
  if (row.kind === "gift_card") return original;
  if (!Number.isFinite(percentOff) || percentOff < PRICE_CAMPAIGN_MIN_PERCENT || percentOff > PRICE_CAMPAIGN_MAX_PERCENT) return original;
  if (!Number.isFinite(row.priceMnt) || row.priceMnt <= 0) return original;
  if (row.compareAtPriceMnt != null && row.compareAtPriceMnt > row.priceMnt) return original;
  const exact = (row.priceMnt * (100 - percentOff)) / 100;
  let sale = Math.round(exact / PRICE_CAMPAIGN_ROUNDING_MNT) * PRICE_CAMPAIGN_ROUNDING_MNT;
  if (sale <= 0) sale = Math.round(exact);
  sale = Math.min(sale, row.priceMnt);
  if (sale >= row.priceMnt || sale <= 0) return original;
  return { priceMnt: sale, compareAtPriceMnt: row.priceMnt, discounted: true };
}

/** Мөрүүдийг ШИНЭ объект болгон буцаана (кэштэй массивыг хэзээ ч өөрчлөхгүй). */
export function applyCampaignToRows<T extends { priceMnt: number; compareAtPriceMnt?: number | null; kind?: string | null }>(
  rows: T[],
  campaign: PriceCampaignWindow | null,
  now: Date = new Date(),
): T[] {
  if (!campaign || !isCampaignLive(campaign, now)) return rows;
  return rows.map(row => {
    const next = campaignPriceFor(row, campaign.percentOff);
    return next.discounted ? { ...row, priceMnt: next.priceMnt, compareAtPriceMnt: next.compareAtPriceMnt } : row;
  });
}
