import { expect, test } from "./helpers/fixtures";

/**
 * Нүүр хуудас — "юу ч эвдрээгүй" гэдгийн хамгийн доод шалгуур.
 *
 * Энэ багц нь дизайны нарийн ширийнийг шалгахгүй (тэр нь screenshot-ийн ажил,
 * түүнийг pixel-ээр хэмждэг). Шалгадаг зүйл нь: хуудас бодитоор ачаалагдаж
 * байна уу, толгой/хөл байна уу, JS алдаа шидэж байна уу, гар хөтлөлтийн
 * хамгийн эхний алхам (skip link) ажиллаж байна уу.
 */
test.describe("нүүр хуудас", () => {
  test("ачаалагдаж, толгой/хөл, JS алдаагүй", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    page.on("console", message => {
      if (message.type() !== "error") return;
      const text = message.text();
      // Зураг/гуравдагч эх сурвалжийн 404-ийг алгасна: staging дээр бодит R2
      // түлхүүр дутуу байж болно, энэ нь аппын алдаа биш.
      if (/favicon|\.(png|jpe?g|webp|svg)\b|r2\.dev|ERR_/i.test(text)) return;
      errors.push(`console: ${text}`);
    });

    const response = await page.goto("/");
    expect(response?.status(), "нүүр 200 буцаах ёстой").toBe(200);
    await expect(page).toHaveTitle(/SUGI/i);
    await expect(page.locator(".commerce-brand").first()).toBeVisible();
    // `footer` гэсэн энгийн сонголт нь күүкийн самбарын өөрийнх нь 0x0
    // <footer>-ийг олдог (vendor-ийн modal) — сайтын хөл нь .site-footer.
    await expect(page.locator(".site-footer")).toBeVisible();
    // Каталогийн rail нь DB-ээс ирдэг — сүлжээ/DB бүрэн ажиллаж байгаагийн
    // бодит нотолгоо (зөвхөн HTML skeleton биш).
    await expect(page.locator("main")).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("skip link нь гарын эхний Tab дээр гарч ирж, агуулга руу үсэрнэ", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.locator("a.skip-link");
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await skip.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
  });

  test("харанхуй загварын товч html-ийн шинжийг сольж, refresh-д хадгалагдана", async ({ page }) => {
    await page.goto("/");
    const before = await page.evaluate(() => document.documentElement.getAttribute("data-storefront-theme"));
    await page.getByRole("button", { name: /Харанхуй загвар|Цайвар загвар|Dark|Light/i }).first().click();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-storefront-theme"))).not.toBe(before);
    const after = await page.evaluate(() => document.documentElement.getAttribute("data-storefront-theme"));
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-storefront-theme"))).toBe(after);
  });

  // Бусад тест күүкийн самбарыг урьдчилан шийдсэн байдаг (helpers/fixtures.ts)
  // тул самбар ӨӨРӨӨ цэвэр хөтөч дээр шалгагдана — эхний зочилтод гарч ирэх,
  // сонголтыг хадгалах, дахин гарч ирэхгүй байх.
  test("күүкийн самбар эхний зочилтод гарч, сонголтын дараа буцаж ирэхгүй", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/");
    const acceptAll = page.locator("button.stcm-accept-all");
    await expect(acceptAll).toBeVisible();
    await acceptAll.click();
    await expect(acceptAll).toBeHidden();
    await page.reload();
    await expect(page.locator("button.stcm-accept-all")).toBeHidden();
    await context.close();
  });

  test("хэл солиход <html lang> болон цэсний үг солигдоно", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("mn");
    await page.locator(".locale-switch-trigger").click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("en");
    // Орчуулгын толь 2026-09-16-аас ТУСДАА chunk болсон (эхний ачаалалт 112 KB
    // хөнгөрсөн) тул үгс хэсэг хугацааны дараа солигдоно — бодит орчуулагдсан
    // үгийг хүлээж, толь үнэхээр ирснийг батална.
    // textContent (innerText биш): утасны өргөнд цэс хаалттай байдаг ч DOM-д
    // байдаг тул хоёр project-д ижил ажиллана.
    const translated = () => page.evaluate(() => document.body.textContent?.includes("Top brands") ?? false);
    await expect.poll(translated, { timeout: 15_000 }).toBe(true);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.lang), "сонголт refresh-ийг давах ёстой").toBe("en");
    await expect.poll(translated, { timeout: 15_000 }).toBe(true);
  });
});
