import { and, eq } from "drizzle-orm";
import { expect, test } from "./helpers/fixtures";
import { faceEnrollments, faceHandoffRequests } from "../drizzle/schema";
import { getDb } from "../server/db";
import { FACE_MODEL_VERSION } from "../shared/face-auth";
import { E2E_MARKER } from "./helpers/environment";
import { ensureE2EUser, signInAs } from "./helpers/session";

/**
 * Камергүй компьютерийн QR handoff — БҮХ гинж хөтөч дээр (2026-09-16).
 *
 * Яагаад энэ тест байх ЁСТОЙ байсан бэ: эхний хувилбарыг зөвхөн type-check
 * болон серверийн тестээр шалгаж production руу гаргасан бөгөөд хөтөч дээр
 * гурван алдаа гарав —
 *   1. QR хоосон цагаан дөрвөлжин (`toCanvas` нь ref бэлэн болоогүй үед),
 *   2. карт зүүн дээд буланд (байхгүй CSS класс бичсэн),
 *   3. **компьютер сервер рүү огт асуудаггүй** — интервалтай effect-ийн
 *      хамаарал 500мс тутам өөрчлөгддөг утга агуулсан тул 2 секундын
 *      interval нэг ч удаа ажиллаж амжалгүй цэвэрлэгддэг байв. Утас зөв
 *      баталж, push ирсэн ч компьютер нээгддэггүй.
 * Гурвууланг нь энэ нэг тест барих байсан.
 *
 * Царайг энд шалгахгүй — автомат тест жинхэнэ нүүр үзүүлж чадахгүй, тэр нь
 * `face-handoff.integration.test.ts` болон `completeFaceVerification`-ийн
 * ажил. Энд шалгагдах зүйл нь: QR бодитоор зурагдсан уу, тоо уншигдаж
 * байна уу, карт төвд үү, ба хамгийн чухал нь **батлагдмагц компьютер
 * ӨӨРӨӨ нээгдэж байна уу**.
 *
 * Хаалга E2E серверт анхдагчаар унтраалттай тул зөвхөн энэ тохиолдолд:
 *   $env:E2E_FACE_GATE="1"; pnpm e2e --project=desktop e2e/face-handoff.spec.ts
 */
const gateOn = process.env.E2E_FACE_GATE === "1";

test.describe("камергүй компьютерийн QR handoff", () => {
  test.skip(!gateOn, "E2E_FACE_GATE=1 шаардлагатай (хаалга асаалттай сервер, 3101 порт).");

  test("QR гарч, баталгаажмагц компьютер өөрөө нээгдэнэ", async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    const admin = await ensureE2EUser("admin");
    const db = await getDb();

    // Сонголтын дэлгэц зөвхөн БҮРТГЭЛТЭЙ хүнд харагддаг тул түр бүртгэл.
    // Дескриптор нь хэзээ ч харьцуулагдахгүй (царайны шалгалт энд байхгүй).
    await db!.delete(faceEnrollments).where(eq(faceEnrollments.userId, admin.id));
    await db!.insert(faceEnrollments).values({
      userId: admin.id,
      descriptorJson: JSON.stringify(Array.from({ length: 128 }, () => 0.01)),
      sampleCount: 5,
      modelVersion: FACE_MODEL_VERSION,
      consentedAt: new Date(),
    });

    try {
      await signInAs(context, "admin", baseURL!);
      await page.goto("/admin");

      // 0) Нууц үг ЭХЛЭЭД (2026-09-22): QR-ийг зөвхөн нууц үгээ баталсан
      //    компьютер гаргана — утас нууц үгийг орлохгүй.
      await page.locator("#admin-password").fill(`${E2E_MARKER}-password-admin`);
      await page.getByRole("button", { name: "Үргэлжлүүлэх" }).click();

      // 1) Сонголтын дэлгэц: хоёр зам ижил түвшинд.
      await expect(page.getByRole("button", { name: /Энэ төхөөрөмжөөр баталгаажуулах/ })).toBeVisible();
      await page.getByRole("button", { name: /Утсаараа баталгаажуулах/ }).click();

      // 2) QR БОДИТООР зурагдсан байх ёстой (хоосон дөрвөлжин биш).
      const qr = page.getByRole("img", { name: "Утсаар уншуулах QR код" });
      await expect(qr).toBeVisible({ timeout: 20_000 });
      const src = (await qr.getAttribute("src")) ?? "";
      expect(src.startsWith("data:image/png;base64,")).toBe(true);
      expect(src.length).toBeGreaterThan(500);

      // 3) Тоо уншигдахаар харагдана (харанхуй дээр харанхуй байсан).
      const numberNode = page.locator(".face-handoff-number");
      expect(Number(await numberNode.textContent())).toBeGreaterThanOrEqual(10);
      expect(await numberNode.evaluate(el => getComputedStyle(el).color), "тоо цайвар байх ёстой").not.toBe("rgb(23, 24, 27)");

      // 4) Карт дэлгэцийн төвд (буланд биш).
      const box = (await page.locator(".face-gate-card").boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(Math.abs((box.x + box.width / 2) - viewport.width / 2), "карт хэвтээ чиглэлд төвд").toBeLessThan(40);

      // 5) Утас баталсан мэт болгоно. Түүхий token нь зөвхөн хөтөчид байдаг
      //    (DB-д зөвхөн sha256) тул тестээс `approveFaceHandoff`-ийг дуудах
      //    боломжгүй — төлвийг шууд бичнэ. Энэ нь яг эвдэрсэн холбоосыг
      //    шалгана: сервер `approved` гэж хэлэхэд КОМПЬЮТЕР мэдэх үү.
      const pending = (await db!.select().from(faceHandoffRequests)
        .where(and(eq(faceHandoffRequests.userId, admin.id), eq(faceHandoffRequests.status, "pending")))).pop();
      expect(pending, "хүлээгдэж буй handoff мөр үүссэн байх ёстой").toBeTruthy();
      await db!.update(faceHandoffRequests).set({ status: "approved", approvedAt: new Date(), approvedByIp: "198.51.100.7" })
        .where(eq(faceHandoffRequests.id, pending!.id));

      // 6) Компьютер 2 секунд тутам асуудаг тул хэдхэн секундэд панель нээгдэнэ.
      await expect(page.getByRole("heading", { level: 1, name: "Хянах самбар" })).toHaveCount(1, { timeout: 30_000 });
    } finally {
      await db!.delete(faceHandoffRequests).where(eq(faceHandoffRequests.userId, admin.id));
      await db!.delete(faceEnrollments).where(eq(faceEnrollments.userId, admin.id));
    }
  });
});
