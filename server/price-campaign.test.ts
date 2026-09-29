import { describe, expect, it } from "vitest";
import { applyCampaignToRows, campaignPriceFor, isCampaignLive, type PriceCampaignWindow } from "../shared/price-campaign";

const now = new Date("2026-10-01T04:00:00Z");
const live: PriceCampaignWindow = { id: 7, percentOff: 20, startsAt: new Date("2026-10-01T00:00:00Z"), endsAt: new Date("2026-10-02T00:00:00Z"), stoppedAt: null };

describe("campaignPriceFor (бүх барааны нийтийн хямдрал)", () => {
  it("хувиар хямдруулж, 100₮ хүртэл энгийнээр бөөрөнхийлнө; анхны үнэ хуучин үнэ болно", () => {
    expect(campaignPriceFor({ priceMnt: 29_900 }, 20)).toEqual({ priceMnt: 23_900, compareAtPriceMnt: 29_900, discounted: true });
    // 12 345 × 0.85 = 10 493.25 → 10 500 (дээш)
    expect(campaignPriceFor({ priceMnt: 12_345 }, 15).priceMnt).toBe(10_500);
    // 12 345 × 0.9 = 11 110.5 → 11 100 (доош)
    expect(campaignPriceFor({ priceMnt: 12_345 }, 10).priceMnt).toBe(11_100);
  });

  it("бэлгийн картыг хөндөхгүй", () => {
    expect(campaignPriceFor({ priceMnt: 50_000, kind: "gift_card" }, 20)).toEqual({ priceMnt: 50_000, compareAtPriceMnt: null, discounted: false });
  });

  it("аль хэдийн хямдралтай (хуучин үнэ > үнэ) барааг хэвээр үлдээнэ", () => {
    expect(campaignPriceFor({ priceMnt: 20_000, compareAtPriceMnt: 25_000 }, 20)).toEqual({ priceMnt: 20_000, compareAtPriceMnt: 25_000, discounted: false });
  });

  it("буруу хувь, 0₮ үнэ, бөөрөнхийлөлтөөр өөрчлөгдөхгүй үнэ — хөндөхгүй", () => {
    expect(campaignPriceFor({ priceMnt: 10_000 }, 0).discounted).toBe(false);
    expect(campaignPriceFor({ priceMnt: 10_000 }, 95).discounted).toBe(false);
    expect(campaignPriceFor({ priceMnt: 0 }, 20).discounted).toBe(false);
    expect(campaignPriceFor({ priceMnt: 100 }, 1).discounted).toBe(false);
  });

  it("хямд бараа 0₮ болохгүй (бөөрөнхийлөлтгүйгээр тооцно)", () => {
    const priced = campaignPriceFor({ priceMnt: 80 }, 50);
    expect(priced.priceMnt).toBe(40);
    expect(priced.discounted).toBe(true);
  });
});

describe("isCampaignLive / applyCampaignToRows", () => {
  it("эхлэх мөчөөс дуусах мөч хүртэл (дуусах мөч орохгүй), зогсоосон бол үгүй", () => {
    expect(isCampaignLive(live, now)).toBe(true);
    expect(isCampaignLive(live, new Date("2026-09-30T23:59:59Z"))).toBe(false);
    expect(isCampaignLive(live, new Date("2026-10-02T00:00:00Z"))).toBe(false);
    expect(isCampaignLive({ ...live, stoppedAt: now }, now)).toBe(false);
  });

  it("шинэ объект буцааж, анхны (кэштэй) массивыг өөрчлөхгүй; хоёр удаа хэрэглэхэд давхар хямдрахгүй", () => {
    const rows = [{ id: 1, priceMnt: 10_000, compareAtPriceMnt: null }, { id: 2, priceMnt: 5_000, compareAtPriceMnt: 8_000 }];
    const once = applyCampaignToRows(rows, live, now);
    expect(rows[0].priceMnt).toBe(10_000);
    expect(once[0]).toEqual({ id: 1, priceMnt: 8_000, compareAtPriceMnt: 10_000 });
    expect(once[1]).toBe(rows[1]);
    const twice = applyCampaignToRows(once, live, now);
    expect(twice[0].priceMnt).toBe(8_000);
  });

  it("идэвхгүй үед анхны массивыг шууд буцаана", () => {
    const rows = [{ priceMnt: 10_000 }];
    expect(applyCampaignToRows(rows, null, now)).toBe(rows);
  });
});
