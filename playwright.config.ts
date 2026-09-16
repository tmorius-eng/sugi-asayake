import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { e2eDatabaseUrl } from "./e2e/helpers/environment";

/**
 * E2E тест (2026-09-16). Энэ төсөлд өмнө нь E2E тест ОГТ байгаагүй — зөвхөн
 * vitest (unit + router-level integration) ба гараар авсан screenshot. Өөрөөр
 * хэлбэл "хөтөч дээр бодитоор дарж үзэх" давхарга бүхэлдээ гар ажил байв.
 *
 *   pnpm build && pnpm e2e            (бүгд)
 *   pnpm e2e --headed --project=desktop
 *   pnpm e2e e2e/shop-navigation.spec.ts
 *
 * ⛔ **Хэзээ ч production схем рүү заахгүй.** Тест сагс дүүргэж, хэрэглэгч
 * үүсгэж, admin-аар бичдэг тул `e2e/helpers/environment.ts` нь `defaultdb`
 * (бодит дэлгүүр) рүү заасан бол ажиллахаас ТАТГАЛЗАНА. Анхдагчаар нэг ижил
 * HeatWave дээрх `sugi_staging` схемийг ашиглана (prod-ын 2026-09-14-ний
 * хуулбар) — өөрөөр хэлбэл хоёр лаптопын аль нь ч нэмэлт тохиргоогүй
 * ажиллуулж чадна, харин бодит захиалга/хэрэглэгч хэзээ ч хөндөгдөхгүй.
 *
 * Серверийг PRODUCTION горимоор (dist/index.js) ачаална, `pnpm dev`-ээр биш:
 * CSP, compression, статик serve — өөрөөр хэлбэл inline script-ийн алдаа зэрэг
 * ЗӨВХӨН production-д гардаг бүх зүйл (docs/PROJECT-GUIDE.md-ийн demo.ps1-ийн
 * тайлбар) энд баригдана. Тиймээс эхлээд `pnpm build`.
 */
/**
 * Царайны хаалгыг E2E-д асаах эсэх (2026-09-16).
 *
 * ⚠️ Хувьсагч нь зориуд `E2E_FACE_GATE` — `ADMIN_FACE_GATE_ENABLED` БИШ. Энэ
 * config нь `.env`-ийг ачаалдаг (helpers/environment.ts) бөгөөд хөгжүүлэгчийн
 * `.env`-д `ADMIN_FACE_GATE_ENABLED=1` бичигдсэн байдаг — түүнийг шууд уншвал
 * БҮХ E2E run чимээгүйгээр хаалгатай горимд орж, admin тестүүд бүгд унана
 * (2026-09-16-нд яг ингэж болсон). Зөвхөн тусгайлан өгсөн үед л асна.
 *
 * Хоёр горим ӨӨР порт дээр: Playwright нь `reuseExistingServer` тул хаалгатай
 * сервер үлдсэн бол дараагийн ердийн run түүнийг дахин ашиглаж мөн л унана.
 */
const GATE_ON = process.env.E2E_FACE_GATE === "1";
const PORT = Number(process.env.E2E_PORT ?? (GATE_ON ? 3101 : 3100));
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
// Гаднах хаяг өгсөн бол (жишээ нь staging тунель) сервер энд ачаалахгүй.
const startsOwnServer = !process.env.E2E_BASE_URL;

if (startsOwnServer && !existsSync("dist/index.js")) {
  throw new Error("dist/index.js байхгүй байна — эхлээд `pnpm build` ажиллуул (эсвэл E2E_BASE_URL өг).");
}

// Playwright энэ файлыг worker процесс бүрт ачаалдаг тул тестийн процессын
// DATABASE_URL-ийг ЭНД сольж байна: тест нь `server/db.ts`-ийг шууд import хийж
// (хэрэглэгч үүсгэх, session token гаргах) чаддаг бөгөөд .env-ийн бодит
// production холболт биш, үргэлж staging схем рүү очно. e2eDatabaseUrl() нь
// defaultdb рүү заасан бол шидэлт хийдэг тул энэ нь чимээгүй болох боломжгүй.
process.env.DATABASE_URL = e2eDatabaseUrl();

export default defineConfig({
  testDir: "e2e",
  // Схем хоцорсон эсэхийг ЭХЛЭЭД шалгана (e2e/global-setup.ts) — эс бөгөөс
  // migration дутуугаас болсон 500 нь "товч олдсонгүй" болж харагдана.
  globalSetup: "./e2e/global-setup.ts",
  // Тестүүд нэг ижил staging DB-г хуваалцдаг тул файл хоорондын параллель
  // ажиллагаа vitest дээр гарсантай яг ижил race үүсгэнэ (docs/PROJECT-GUIDE.md:
  // `--no-file-parallelism`). Нэг worker — удаан ч урьдчилан таамаглахуйц.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    // Бангалор биш Токио ч гэсэн HeatWave руу RTT бий; анхдагч 5с богино.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    locale: "mn-MN",
    timezoneId: "Asia/Ulaanbaatar",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // Худалдан авагчийн дийлэнх нь утаснаас ирдэг тул утасны өргөн нь
    // "нэмэлт" биш, тэнцүү эрхтэй project.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: startsOwnServer
    ? {
        command: "node dist/index.js",
        url: `http://127.0.0.1:${PORT}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          NODE_ENV: "production",
          PORT: String(PORT),
          DATABASE_URL: e2eDatabaseUrl(),
          // Царайны хаалга нь бодит камер шаарддаг тул admin E2E-д боломжгүй.
          // Энэ нь ЗӨВХӨН энэ түр серверийн орчин — production дээрх хаалга
          // хөндөгдөхгүй (server/_core/env.ts-ийн getter орчноос уншина).
          // Анхдагчаар унтраалттай (камер шаарддаг тул E2E давж чадахгүй), гэхдээ
          // гаднаас `ADMIN_FACE_GATE_ENABLED=1` өгвөл хаалгыг асаана — царайны
          // дэлгэцүүдийг нүдээр/screenshot-оор шалгах цорын ганц зам.
          ADMIN_FACE_GATE_ENABLED: GATE_ON ? "1" : "0",
          // Тест ХЭЗЭЭ Ч бодит утсанд push илгээхгүй, имэйл явуулахгүй.
          NOTIFICATIONS_SUPPRESS: "1",
          NOTIFICATIONS_DISPATCH: "0",
          // Зочны checkout-ийн SMS баталгаажуулалт бодит verify.mn руу явдаг.
          GUEST_CHECKOUT_OTP: "0",
          // Ард ажиллах ажлууд (орхигдсон сагс, вендорын таталт) E2E-ийн
          // хугацаанд ажиллах ямар ч шалтгаангүй.
          RUN_BACKGROUND_JOBS: "0",
          MODERATION_MODEL: "0",
        },
      }
    : undefined,
});
