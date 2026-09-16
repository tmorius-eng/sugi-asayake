import { test as base } from "@playwright/test";

/**
 * Күүкийн зөвшөөрлийн самбарыг урьдчилан "шийдсэн" болгоно.
 *
 * Яагаад: Silktide-ийн самбар нь эхний зочилтод modal маягаар гарч ирээд
 * "Бүгдийг зөвшөөрөх" товч дээрээ фокус авдаг бөгөөд фокусыг өөртөө барьдаг.
 * Тиймээс самбарыг хаагаагүй үед storefront-ийн ЯМАР Ч гар хөтлөлтийн тест
 * (эхний Tab → skip link) болон анхны товшилт самбар руу л очно. Энэ бол
 * аппын алдаа биш — modal зөвшөөрлийн самбарын хүлээгдсэн зан төлөв — харин
 * тест бүр түүнийг дахин дахин хаах нь утгагүй давталт.
 *
 * Түлхүүрүүд нь vendor-ийн өөрийнх нь эх кодоос (`_buildConsentKey`,
 * `_buildHasConsentedKey` — client/public/vendor/silktide-consent-manager.js):
 * `stcm.hasConsented` ба `stcm.consent.<id>`; id-ууд нь
 * client/public/vendor/silktide-consent-init.js-д зарлагдсан гурав.
 *
 * Analytics/marketing-ийг ТАТГАЛЗСАН төлөвт тавьж байна: тест ажиллахад бодит
 * GA4/Pixel beacon явах ёсгүй. Самбарыг өөрийг нь шалгах тест нь өөрийн цэвэр
 * context үүсгэнэ (storefront.spec.ts).
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      try {
        localStorage.setItem("stcm.hasConsented", "true");
        localStorage.setItem("stcm.consent.essential", "true");
        localStorage.setItem("stcm.consent.analytics", "false");
        localStorage.setItem("stcm.consent.marketing", "false");
      } catch {
        // Private browsing — самбар гарч ирэх ч тест өөрөө унахгүй.
      }
    });
    await use(context);
  },
});

export { expect } from "@playwright/test";
