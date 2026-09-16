import { expect, test } from "./helpers/fixtures";

/**
 * Мэдэгдэл авах гарц (2026-09-16).
 *
 * Tom: *"Утаснаас орж байгаа хүмүүс notification allow сонголт хийчвэл
 * browser-оо хаасан ч утсан дээр нь notification ирдэг болгмоор байна, бас
 * desktop PC ялгаагүй!"*
 *
 * Web Push-ийн сервер тал 2026-09-13-аас ажилладаг байсан — дутуу байсан
 * зүйл нь **зөвшөөрөл асуух гарц**: тэр нь зөвхөн /profile → Тохиргоо доторх
 * шилжүүлэгч байсан тул хэн ч олохгүй байв. Энд шалгах зүйл:
 *   1. Сервер талын түлхүүр бодитоор өгөгдөж байна уу (байхгүй бол товч огт
 *      гарахгүй, хэн ч мэдэгдэл авахгүй — чимээгүй эвдрэл).
 *   2. Гарц нь ☰ цэс болон footer хоёуланд байна уу.
 *   3. Нэвтрээгүй хүнд юу болох (чимээгүй бүтэлгүйтэх ЁСГҮЙ).
 *   4. iPhone дээр "дэмждэггүй" биш, "эхлээд суулгана уу" гэж хэлэх ёстой.
 */

test.describe("мэдэгдэл авах", () => {
  // Headless Chromium-д Notification.permission анхдагчаар "denied" байдаг тул
  // бодит хөтчийн анхдагч төлөвийг гаргаж өгнө (жинхэнэ Chrome дээр "default").
  test.use({ permissions: ["notifications"] });
  test("сервер VAPID түлхүүрээ өгдөг (үүнгүйгээр гарц огт гарахгүй)", async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/api/trpc/push.publicKey?input=%7B%22json%22%3Anull%7D`);
    expect(response.status()).toBe(200);
    const key = (JSON.parse(await response.text()) as { result: { data: { json: { key: string | null } } } }).result.data.json.key;
    expect(key, "VAPID_PUBLIC_KEY тохируулагдсан байх ёстой").toBeTruthy();
    expect(key!.length).toBeGreaterThan(20);
  });

  test("☰ цэс болон footer хоёуланд гарна", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator(".footer-notify")).toHaveCount(1);
    await page.getByRole("button", { name: "Цэс нээх" }).click();
    await expect(page.locator(".commerce-mobile-menu-row").filter({ hasText: "Мэдэгдэл авах" })).toBeVisible();
  });

  test("нэвтрээгүй хүнд нэвтрэхийг санал болгоно (чимээгүй бүтэлгүйтэхгүй)", async ({ page }) => {
    await page.goto("/");
    await page.locator(".footer-notify").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("нэвтэрсэн байх шаардлагатай", { exact: false })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Нэвтрэх" })).toBeVisible();
  });
});

/**
 * iOS-ийн бодит нөхцөл: iOS 16.4-өөс хойш Web Push ажилладаг ч ЗӨВХӨН нүүр
 * дэлгэцэд суулгасан апп дотор — энгийн Safari таб дээр `window.PushManager`
 * огт байхгүй. Тиймээс тестэд яг тэр нөхцөлийг үүсгэнэ (UA дангаараа
 * хангалтгүй: Chromium нь iPhone-ы UA-тай ч PushManager-тэй хэвээр).
 */
test.describe("iPhone дээр эхлээд суулгах шаардлагатай", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });

  test("\"дэмждэггүй\" биш, суулгах зааврыг үзүүлнэ", async ({ context, page }) => {
    await context.addInitScript(() => {
      // Safari таб дээрх байдлыг дуурайна.
      Reflect.deleteProperty(window, "PushManager");
    });
    await page.goto("/");
    await page.locator(".footer-notify").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("нүүр дэлгэцэд нэмэх шаардлагатай", { exact: false })).toBeVisible();
    // Суулгах заавар нь энэ цонх дотроо байна — хэрэглэгчийг хөөж явуулахгүй.
    await expect(dialog.getByText("1 / 4")).toBeVisible();
    await expect(dialog.getByText("хуудасны цэсийн дүрсийг", { exact: false })).toBeVisible();
  });
});
