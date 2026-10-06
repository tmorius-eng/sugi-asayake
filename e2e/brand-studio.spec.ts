import { expect, test } from "./helpers/fixtures";
import { signInAs } from "./helpers/session";
import { openAdminSection } from "./helpers/admin";

/**
 * /admin → Брэнд студи (2026-10-05, A1). Сервер талыг brand-studio.integration.test.ts шалгадаг;
 * энд: амьд preview бодитоор өнгө авдаг, AA анхааруулга + "Бүгдийг засах", баярын урьдчилан
 * харалт (постер + мэндчилгээ) iframe-д гардаг, утсан дээр хуудас хэвтээ гүйлгэхгүй.
 * Юу ч ХАДГАЛАХГҮЙ — staging-ийн өнгийг бусад spec (контраст) хэмждэг.
 */
test.describe("Брэнд студи", () => {
  test("өнгө → амьд preview, AA хамгаалалт, баярын урьдчилан харалт", async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    await signInAs(context, "admin", baseURL!);
    await page.goto("/admin");
    await openAdminSection(page, "Брэнд студи");
    await expect(page.getByText(/Одоо идэвхтэй:/)).toBeVisible();

    const frame = page.frameLocator('iframe[title="Сайтын урьдчилан харах"]');
    await expect(frame.locator(".hero-copy h1")).toBeVisible({ timeout: 30_000 });
    const readVar = (name: string) => frame.locator("html").evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

    // Үндсэн өнгө солиход iframe-ийн --primary хуудас дахин ачаалалгүй солигдоно.
    await page.getByLabel("Үндсэн өнгө (товч) — hex").fill("#1d4e9e");
    await expect.poll(() => readVar("--primary"), { timeout: 5_000 }).toBe("#1d4e9e");
    await expect(page.getByRole("button", { name: "Хадгалах" })).toBeEnabled();

    // Унших боломжгүй хослол → анхааруулга, хадгалах хаалттай → "Бүгдийг засах".
    await page.getByLabel("Товч дээрх текст — hex").fill("#7aa0e0");
    await expect(page.getByText(/Унших боломжгүй \d+ хослол/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Хадгалах" })).toBeDisabled();
    await page.getByRole("button", { name: "Бүгдийг засах" }).click();
    await expect(page.getByText(/Бүх текст уншигдахуйц/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("brand-studio-colors.png"), fullPage: false });

    // Цуцлах — юу ч хадгалахгүй.
    await page.getByRole("button", { name: "Цуцлах" }).click();
    await expect.poll(() => readVar("--primary"), { timeout: 5_000 }).not.toBe("#1d4e9e");

    // Логоноос палитр (A2): сайтын логоноос 3 палитр, дарахад preview-д шууд.
    await page.getByRole("button", { name: "Логоноос өнгө гаргах" }).click();
    await expect(page.getByRole("button", { name: /— туршиж үзэх$/ })).toHaveCount(3, { timeout: 20_000 });
    await page.getByRole("button", { name: "Тод — туршиж үзэх" }).click();
    await expect(page.getByText(/Бүх текст уншигдахуйц/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("brand-studio-logo-palette.png"), fullPage: false });
    await page.getByRole("button", { name: "Цуцлах" }).click();

    // Фонт (A2): гарчгийн фонт солиход preview-ийн h1 тэр фонтоор (reload-гүй).
    await page.getByLabel("Гарчгийн фонт").selectOption("montserrat");
    await expect.poll(() => frame.locator(".hero-copy h1").evaluate(el => getComputedStyle(el).fontFamily), { timeout: 5_000 }).toContain("Montserrat");
    await page.screenshot({ path: testInfo.outputPath("brand-studio-fonts.png"), fullPage: false });
    await page.getByRole("button", { name: "Цуцлах" }).click();
    await expect.poll(() => frame.locator(".hero-copy h1").evaluate(el => getComputedStyle(el).fontFamily), { timeout: 5_000 }).toContain("Golos");

    // Нүүрний бүтэц (A3): салбаруудыг хамгийн дээр, ангиллыг нуух — preview reload-гүй дахин эрэмбэлнэ.
    await page.getByRole("tab", { name: "Нүүрний бүтэц" }).click();
    for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "Салбарууд — дээш" }).click();
    await page.getByRole("button", { name: /Ангиллууд — нуух/ }).click();
    await expect.poll(async () => frame.locator("main > *").evaluateAll(nodes => nodes.findIndex(n => n.id === "stores" || n.querySelector("#stores"))), { timeout: 5_000 }).toBe(1);
    await expect(frame.locator("#collection")).toHaveCount(0);
    // Чөлөөт зурвас 1: гарчиг бичиж, харуулахад preview-д гарна.
    await page.getByRole("button", { name: "Чөлөөт зурвас 1 — засах" }).click();
    await page.getByLabel(/Гарчиг \(заавал/).fill("Намрын шинэ ирэлт");
    await page.getByRole("button", { name: "Чөлөөт зурвас 1 — харуулах" }).click();
    await expect(frame.locator(".free-block h2")).toHaveText("Намрын шинэ ирэлт", { timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("brand-studio-layout.png"), fullPage: false });
    await page.getByRole("button", { name: "Цуцлах" }).click();
    await expect.poll(async () => frame.locator("#stores").count()).toBe(1);

    // Баярын таб: 13 карт, Цагаан сарын урьдчилан харалт → постер + мэндчилгээ iframe-д.
    await page.getByRole("tab", { name: "Баярын загвар" }).click();
    await expect(page.getByRole("button", { name: "Урьдчилан харах" })).toHaveCount(13);
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Цагаан сар" }) });
    await card.getByRole("button", { name: "Урьдчилан харах" }).click();
    await expect(frame.locator(".hero-greeting")).toHaveText("Сар шинэдээ сайхан шинэлээрэй!", { timeout: 5_000 });
    await expect(frame.locator('[data-slot="home-hero"] img').first()).toHaveAttribute("src", /\/themes\/holidays\/v\d+\/tsagaan-sar\.webp$/);
    await expect.poll(async () => frame.locator('[data-slot="home-hero"] img').first().evaluate(img => (img as HTMLImageElement).naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath("brand-studio-holidays.png"), fullPage: false });

    // Эзэн солих таб: нэр, алхам, брэнд багц, CLI цэвэрлэгээ (вэбээс устгах товч байхгүй).
    await page.getByRole("tab", { name: "Эзэн солих" }).click();
    await expect(page.getByRole("tab", { name: "Эзэн солих" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Баярын загвар" })).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("heading", { name: "Брэндийн нэр" })).toBeVisible();
    await expect(page.getByLabel(/Богино нэр/)).not.toHaveValue("");
    await expect(page.getByRole("heading", { name: "Хуучин эзний өгөгдөл цэвэрлэх" })).toBeVisible();
    await expect(page.getByText("Брэнд багц импортлох")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("brand-studio-owner.png"), fullPage: false });

    // Утасны өргөнд хуудас бүхэлдээ хэвтээ гүйлгэхгүй.
    if (testInfo.project.name === "mobile") {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("баярын чимэглэл: preview-д цас ба алхан хээ, хөдөлгөөн багасгавал гарахгүй", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin", baseURL!);
    await page.goto("/admin");
    await openAdminSection(page, "Брэнд студи");
    const frame = page.frameLocator('iframe[title="Сайтын урьдчилан харах"]');
    await expect(frame.locator(".hero-copy h1")).toBeVisible({ timeout: 30_000 });
    // iframe-ийн `load` дуусмагц PreviewFrame өөрийн төлөвөө (цасгүй) дахин илгээдэг — тэр болтол хүлээхгүй бол
    // тестийн "snow" мессежийг дарна. Баярын үед hero-ийн том зураг тул `load` удаан (2026-10-06).
    await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>('iframe[title="Сайтын урьдчилан харах"]')?.contentDocument?.readyState === "complete", undefined, { timeout: 30_000 });
    await page.waitForTimeout(400);
    const post = (effect: string, ornament: string) => page.evaluate(([e, o]) => {
      const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Сайтын урьдчилан харах"]')!;
      iframe.contentWindow!.postMessage({ type: "brand-preview", mode: "light", vars: {}, effect: e, ornament: o }, window.location.origin);
    }, [effect, ornament]);
    await post("snow", "alkhan");
    await expect(frame.locator('[data-holiday-effect="snow"] i').first()).toBeAttached({ timeout: 10_000 });
    await expect(frame.locator('[data-holiday-ornament="alkhan"]')).toBeVisible();
    await page.waitForTimeout(2500);
    await page.locator('iframe[title="Сайтын урьдчилан харах"]').screenshot({ path: test.info().outputPath("holiday-decor.png") });
    await post("none", "none");
    await expect(frame.locator("[data-holiday-effect]")).toHaveCount(0);
    await expect(frame.locator("[data-holiday-ornament]")).toHaveCount(0);
  });

  test("таб/апп дүрс ба manifest тохиргооноос (асаагаагүй үед статик дүрс хэвээр)", async ({ request }) => {
    const icon = await request.get("/brand-icon/icon-192.png");
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toContain("image/png");
    expect((await request.get("/brand-icon/evil.png")).status()).toBe(404);
    const manifest = await (await request.get("/manifest.webmanifest")).json() as { name: string; short_name: string; icons: Array<{ src: string }> };
    expect(manifest.name.length).toBeGreaterThan(0);
    // Тохиргоо (brand-icons-from-symbol) асаагаагүй — статик дүрс хэвээр, 302-гүй.
    expect(manifest.icons.every(i => i.src.startsWith("/icons/"))).toBe(true);
    const html = await (await request.get("/")).text();
    expect(html).toContain('href="/icons/favicon-64.png"');
  });

  test("энгийн хэрэглэгчийн iframe-гүй хуудсанд гүүр юу ч хийхгүй", async ({ page }) => {
    await page.goto("/?brandPreview=1");
    await expect(page.locator("html")).not.toHaveAttribute("data-brand-preview", "");
  });
});
