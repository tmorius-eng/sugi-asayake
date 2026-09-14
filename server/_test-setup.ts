/**
 * Vitest setup — тест файл import хийгдэхээс өмнө worker бүрт ажиллана.
 *
 * 1. .env-ийг апп болон scripts/-тэй ижил аргаар ачаална. Үүнгүйгээр vitest
 *    DATABASE_URL / S3_*-ийг огт хардаггүй байв: integration gate-үүд
 *    (RUN_AUTH_INTEGRATION_TESTS, COMMERCE_INTEGRATION_TESTS, RUN_MEDIA_INTEGRATION_
 *    TESTS) тестийг АСААХ ч shell тэдгээр утгыг гараар export хийгээгүй бол "Database
 *    unavailable" / "Storage config missing" гэж унана. Энэ нь тестлэж буй кодтой
 *    ямар ч хамаагүй шалтгаанаар бүрэн локал run-ийг эвдэрсэн мэт (22 файл унасан)
 *    харуулж байв.
 *
 *    CI дээр .env файл байхгүй, dotenv чимээгүй no-op тул gate-үүд унтраалттай
 *    хэвээр, холбогдох тестүүд өмнөх шигээ алгасагдана.
 *
 * 2. Орчинд байхгүй үед түр INTEGRATIONS_ENCRYPTION_KEY өгнө. server/integrations.
 *    integration.test.ts-ийн "integration config encryption (unit)" тестүүд GATE-ГҮЙ
 *    ажилладаг (DB-д хүрдэггүй), server/_core/crypto.ts-ийн getKey() 64 тэмдэгт hex
 *    түлхүүргүй бол throw хийдэг — тиймээс шинэ clone, GitHub Actions дээр тэр хоёр
 *    тест ямар нэг алдаанаас биш тохиргоо дутуугаас унаж байв.
 *
 *    Тэдгээр тест encryptJson/decryptJson round-trip хийдэг, өөрчилсөн blob
 *    татгалзагддагийг батална. Хоёр шинж ЯМАР Ч хүчинтэй түлхүүрт хадгалагддаг тул
 *    доорх утга дур зоргын, юу ч хамгаалдаггүй: тест процесс дотор тестийн өөрийн
 *    зохиосон өгөгдлийг л шифрлэнэ.
 *
 *    Энэ аппликейшнийг санаатайгаар сулруулахгүй: server/_core/env.ts, crypto.ts
 *    хөндөгдөөгүй тул бодит сервер бодит түлхүүр тохируулаагүй бол юу ч шифрлэхээс
 *    татгалзсаар. docs/PROJECT-GUIDE.md-ийн анхааруулдаг сул анхдагчийн эрсдэл ТЭНД
 *    fallback тавихаас гарна, энд биш. Энд тавьснаар CI-д repo secret хэрэггүй, шинэ
 *    clone тохиргоогүй `pnpm test` ногоон ажиллуулна.
 *
 *    .env эсвэл орчны бодит түлхүүр үргэлж ялна — энэ зөвхөн цоорхой нөхнө, хэзээ ч
 *    дарж бичихгүй.
 */
import "dotenv/config";

// Guest checkout phone verification (2026-09-14) is a real SMS round trip
// with verify.mn; no test can answer one. Off here, and the one suite that
// exercises the guard (checkout-otp.integration.test.ts) switches it on for
// its own calls only.
process.env.GUEST_CHECKOUT_OTP = "0";

if (!process.env.INTEGRATIONS_ENCRYPTION_KEY) {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = "0".repeat(64);
}

// 3. Phone push notifications (2026-09-11). The integration suites place
//    real orders on the shared Aiven database; without this, the "new order"
//    pushes they cause would be queued as real and delivered to the shop
//    staff's phones by whichever machine is running the dispatcher. With it,
//    they are written as `suppressed`: still assertable, never sent. This one
//    DOES override the environment, on purpose -- no test run should ever
//    page a real person.
process.env.NOTIFICATIONS_SUPPRESS = "1";

// 4. Admin face gate (2026-09-12). Every admin-panel procedure now refuses a
//    call without a live face-proof cookie, and the integration suites build
//    callers with no cookies at all. Off by default here; the face suites
//    switch it on for themselves (ENV.adminFaceGateEnabled is a getter).
process.env.ADMIN_FACE_GATE_ENABLED = "0";
