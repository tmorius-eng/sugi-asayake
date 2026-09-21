import { expect, test } from "./helpers/fixtures";

/**
 * Серверийн илгээдэг <head> — crawler-ийн ХАРДАГ хувилбар (2026-09-21).
 *
 * Эдгээрийг хөтөч дээр биш, ТҮҮХИЙ HTML дээр шалгана: Google-ийн эхний
 * дамжлага, Facebook/Messenger-ийн preview нь аппын JavaScript ажиллуулахгүй
 * тул зөвхөн серверийн буулгасан тэмдэгүүд л үнэн.
 *
 * Яагаад үүсэв: 2026-09-21-нд Lighthouse нь /shop дээр "valid rel=canonical
 * байхгүй" гэж заав. Шалтгаан нь бараа/нийтлэлээс бусад БҮХ хуудас canonical-аа
 * НҮҮР ХУУДАС гэж зарладаг байсан явдал — Google-д "/shop, /help, /journal,
 * /returns бүгд нүүрийн хуулбар" гэсэн үг бөгөөд индексээс хасагдах шалтгаан.
 * Энэ нь хөтөч дээр огт харагддаггүй тул зөвхөн ийм тест л барина.
 */
const canonicalOf = (html: string) => html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null;

test.describe("SEO толгой (серверийн HTML)", () => {
  for (const path of ["/", "/shop", "/help", "/journal", "/returns", "/brands"]) {
    test(`${path}: canonical нь ӨӨРИЙНХӨӨ хаягийг заана`, async ({ request, baseURL }) => {
      const html = await (await request.get(path)).text();
      const canonical = canonicalOf(html);
      expect(canonical, `${path} дээр canonical байх ёстой`).toBeTruthy();
      // Origin нь орчноос хамаарна (PUBLIC_BASE_URL эсвэл локал порт) тул
      // зөвхөн замыг нь харьцуулна.
      expect(new URL(canonical!, baseURL).pathname.replace(/\/+$/, "") || "/").toBe(path.replace(/\/+$/, "") || "/");
    });
  }

  test("шүүлттэй /shop нь цэвэр /shop руу нэгтгэгдэнэ", async ({ request, baseURL }) => {
    // Шүүлтүүрийн хязгааргүй хослолыг индекслүүлэхгүй: ?q=, ?page= бүгд нэг
    // канон хуудас руу заана.
    const html = await (await request.get("/shop?q=%D0%BC%D0%B0%D1%81%D0%BA&page=2")).text();
    expect(new URL(canonicalOf(html)!, baseURL).pathname).toBe("/shop");
  });

  test("барааны хуудас: өөрийн canonical, Product + BreadcrumbList", async ({ request }) => {
    const shop = await (await request.get("/shop")).text();
    void shop;
    // Бодит нийтлэгдсэн барааг каталогоос авна (staging дахь тодорхой slug-д
    // холбогдохгүйн тулд).
    const list = await (await request.get("/sitemap.xml")).text();
    const slug = list.match(/\/product\/([^<]+)</)?.[1];
    test.skip(!slug, "sitemap-д бараа алга.");
    const html = await (await request.get(`/product/${slug}`)).text();
    expect(canonicalOf(html)).toContain(`/product/${slug}`);

    const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    expect(block, "барааны хуудас structured data авч явах ёстой").toBeTruthy();
    const data = JSON.parse(block!) as Array<Record<string, unknown>>;
    const types = (Array.isArray(data) ? data : [data]).map(entry => entry["@type"]);
    expect(types).toContain("Product");
    // Breadcrumb нь хуудсан дээр нүдэнд харагддаг байсан ч crawler-т
    // өгөгддөггүй байв (2026-09-20).
    expect(types).toContain("BreadcrumbList");
  });
});
