/**
 * k6 ачааллын тест — зочны бодит урсгал (2026-09-16).
 *
 *   k6 run -e BASE_URL=https://sugi-staging.karkaron.com scripts/load/storefront.js
 *   k6 run -e BASE_URL=https://sugi-staging.karkaron.com -e STAGE=peak scripts/load/storefront.js
 *
 * ⛔ ЗӨВХӨН staging (`sugi-staging.karkaron.com`) эсвэл локал сервер рүү
 * ажиллуул. Production руу чиглүүлбэл (a) Cloudflare-ийн rate-limit дүрэм
 * (150 хүсэлт / 10 с / IP) чамайг өөрийг чинь хаана, (b) аппын доторх
 * `visitor_sessions` хүснэгтэд хуурамч зочин бичигдэж хөрвүүлэлтийн хувийг
 * гуйвуулна, (c) нэг DB-г хуваалцдаг тул бодит худалдан авагчийн хүсэлт
 * удаашрана.
 *
 * Юуг хэмждэг вэ: нүүр хуудсыг нээх нь ганц HTML биш — HTML + зэрэгцээ хэдэн
 * tRPC дуудлага (эдгээр нь клиентийн бодит дуудлагууд, client/src/pages/Home.tsx
 * болон Shop.tsx-ээс авсан) + барааны зураг бүрийн /cdn/ redirect. Тиймээс
 * "хэдэн хэрэглэгч" гэдгийг iteration-аар, хүсэлтийн тоог биш.
 *
 * STAGE:
 *   smoke (анхдагч) — 5 VU / 1 мин: дүрэм зөв эсэхийг шалгах, ачаалал биш
 *   ramp            — 0 -> 200 VU / 9 мин: тасрах цэгийг олох
 *   peak            — 500 VU / 5 мин: "10k зочин" гэдгийн бодит хувилбар
 *                     (10k нэгэн зэрэг ХУУДАС НЭЭХГҮЙ — 10k session нь
 *                     ойролцоогоор 300–600 зэрэгцээ идэвхтэй хүсэлт)
 *
 * Хэмжилтийн дараа хаанаас хайх вэ: /admin → Гүйцэтгэл → SQL лог (удаан query),
 * `pm2 logs sugi`, HeatWave-ийн Threads_connected (pool 25-д тулж байна уу).
 */
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
// 2026-09-23: том/жижиг үсэг ба төгсгөлийн цэгийг ("SUGI.karkaron.com.") ч барина.
if (/(^|\/\/|\.)sugi\.karkaron\.com\.?(:|\/|$)/i.test(BASE)) {
  throw new Error("BASE_URL нь production байна. Staging эсвэл localhost руу чиглүүл (толгойн тайлбарыг үз).");
}

const STAGES = {
  smoke: [{ duration: "1m", target: 5 }],
  ramp: [
    { duration: "2m", target: 50 },
    { duration: "3m", target: 200 },
    { duration: "3m", target: 200 },
    { duration: "1m", target: 0 },
  ],
  peak: [
    { duration: "1m", target: 500 },
    { duration: "3m", target: 500 },
    { duration: "1m", target: 0 },
  ],
};

export const options = {
  stages: STAGES[__ENV.STAGE || "smoke"] || STAGES.smoke,
  thresholds: {
    // Тасрах цэгийг олоход тест өөрөө улаан болж зогсохгүй байх ёстой тул
    // abortOnFail БАЙХГҮЙ — эдгээр нь дүгнэлтийн шугам, зогсоох нөхцөл биш.
    http_req_failed: ["rate<0.02"],
    "http_req_duration{kind:html}": ["p(95)<2000"],
    "http_req_duration{kind:trpc}": ["p(95)<1500"],
  },
  // Cloudflare-ийн хувьд нэг VU = нэг хөтөч: холболтоо дахин ашиглана.
  noConnectionReuse: false,
  discardResponseBodies: false,
};

const homeTrend = new Trend("flow_home_ms", true);
const shopTrend = new Trend("flow_shop_ms", true);

// Клиент superjson transformer ашигладаг (client/src/main.tsx) тул сервер
// `?input=` дотроос `{"json": …}` дугтуй хүлээдэг. Дугтуйгүй илгээвэл zod
// татгалзаж 400 буцаана — өөрөөр хэлбэл тест "хурдан" гарч ирээд юу ч хэмжихгүй.
// Оролтгүй procedure-д `input` параметрийг огт нэмэхгүй.
function trpc(path, input, kind = "trpc") {
  const query = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  return { method: "GET", url: `${BASE}/api/trpc/${path}${query}`, params: { tags: { kind, path } } };
}

export default function () {
  group("home", () => {
    const started = Date.now();
    const html = http.get(`${BASE}/`, { tags: { kind: "html", page: "home" } });
    check(html, { "нүүр 200": r => r.status === 200, "нүүр HTML": r => (r.headers["Content-Type"] || "").includes("text/html") });
    // Клиент эдгээрийг зэрэг илгээдэг тул batch-аар — дараалуулж илгээвэл
    // сервер дээрх зэрэгцээ ачаалал бодит байдлаас бага гарна.
    const responses = http.batch([
      trpc("catalog.bestsellers"),
      trpc("catalog.featuredBrands"),
      trpc("content.siteMedia"),
      trpc("content.branches"),
      trpc("reviews.featured"),
      trpc("catalog.publishedCount"),
    ]);
    check(responses[0], { "bestsellers 200": r => r.status === 200 });
    homeTrend.add(Date.now() - started);
  });
  sleep(Math.random() * 3 + 1);

  group("shop", () => {
    const started = Date.now();
    const html = http.get(`${BASE}/shop`, { tags: { kind: "html", page: "shop" } });
    check(html, { "shop 200": r => r.status === 200 });
    const listed = http.batch([
      trpc("catalog.list", { page: 1 + Math.floor(Math.random() * 5), pageSize: 24, sort: "featured", inStockOnly: false }),
      trpc("content.branches"),
    ]);
    check(listed[0], { "catalog.list 200": r => r.status === 200 });
    shopTrend.add(Date.now() - started);
  });
  sleep(Math.random() * 3 + 1);

  group("search", () => {
    // Хайлт нь FULLTEXT index рүү явдаг цорын ганц зам тул тусад нь ачаалдаг
    // (каталогийн 10с cache энд туслахгүй — түлхүүр үг бүр өөр).
    const term = ["крем", "shampoo", "сүү", "cocochi", "маск"][Math.floor(Math.random() * 5)];
    const spec = trpc("catalog.search", { query: term });
    const found = http.get(spec.url, spec.params);
    check(found, { "хайлт 200": r => r.status === 200 });
  });
  sleep(Math.random() * 4 + 2);
}
