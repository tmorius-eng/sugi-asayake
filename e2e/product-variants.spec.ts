import { expect, test } from "./helpers/fixtures";
import { acceptConfirm } from "./helpers/confirm";
import { E2E_MARKER } from "./helpers/environment";
import { signInAs } from "./helpers/session";
import { openAdminSection } from "./helpers/admin";

/**
 * Барааны хувилбар (variants) — PHASE 1+2 нь 2026-08-26-нд дууссан ч
 * docs/PROJECT-GUIDE.md өнөөг хүртэл "олон variant-тай бодит бараагаар нүдээр
 * баталгаажуулаагүй" гэж тэмдэглэсээр байсан: каталогийн 937 бараагийн 936 нь
 * ганц variant-тай тул сонгогч ХЭЗЭЭ Ч харагддаггүй.
 *
 * Тиймээс энэ тест өөрөө хоёр variant-тай бараа admin-аар үүсгээд, худалдан
 * авагчийн нүдээр шалгаад, дараа нь өөрөө устгана. Шалгах гол зүйл: сонголт
 * бүр өөрийн ҮНЭ-ийг харуулж, сагсанд яг СОНГОСОН variant орох эсэх (энэ нь
 * буруу байвал хүн өөр бараа авчихна).
 */
test.describe("барааны хувилбар", () => {
  test("хоёр хувилбартай бараа: сонголт үнийг сольж, сагсанд зөв variant орно", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin", baseURL!);
    const stamp = Date.now().toString(36);
    const name = `${E2E_MARKER} variant ${stamp}`;
    const slug = `${E2E_MARKER}-variant-${stamp}`;

    await page.goto("/admin");
    await openAdminSection(page, "Бүтээгдэхүүн");

    // 1) Бараа үүсгэх (анхдагч variant серверт автоматаар үүснэ).
    await page.getByRole("button", { name: "Бүтээгдэхүүн нэмэх" }).click();
    await page.getByLabel("Нэр", { exact: true }).fill(name);
    await page.getByLabel("SKU", { exact: true }).fill(`${slug}-a`);
    // Энэ шошгоны дотор "Бодит хаяг: /product/…" гэсэн тайлбар бий тул
    // хүртээмжийн нэр нь яг "URL slug" биш — эхлэлээр нь тааруулна.
    await page.getByLabel(/^URL slug/).fill(slug);
    await page.getByLabel("Үнэ (₮)", { exact: true }).fill("10000");
    const category = page.locator("form select").first();
    await category.selectOption((await category.locator("option:not([disabled])").first().getAttribute("value"))!);
    // Шинэ бараа анхдагчаар нийтлэгдээгүй байдаг — худалдан авагчийн талыг
    // шалгах гэж байгаа тул зориуд нийтэлнэ.
    await page.getByLabel("Нийтлэхэд бэлэн").check();
    await page.getByRole("button", { name: "Бүтээгдэхүүн үүсгэх" }).click();

    // 2) Хоёр дахь variant нэмэх — editor-ийг дахин нээж variant самбар руу.
    await page.getByPlaceholder("Нэр, SKU хайх").fill(name);
    await page.getByRole("button", { name: `${name} засах` }).click();
    await expect(page.getByText("ХУВИЛБАРУУД (VARIANTS)")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Variant нэмэх" }).click();
    // "Үнэ (₮)" ба "Үлдэгдэл" шошго барааны маягтад ч бий тул variant-ийн
    // хэсгээр нь хүрээлнэ (SKU/баркод нь зөвхөн энд байдаг тул түүнийг зангуу
    // болгов). 2026-09-16 хүртэл энэ хэсэг үүрлэсэн <form> байсан бөгөөд яг
    // тэр нь "Variant үүсгэх" дарахад барааны маягтыг илгээдэг алдааны шалтгаан.
    await page.getByLabel(/^SKU\/баркод/).fill(`${slug}-b`);
    const variantFields = page.locator("div").filter({ has: page.getByLabel(/^SKU\/баркод/) }).last();
    await variantFields.getByLabel(/^Үнэ/).fill("25000");
    await variantFields.getByLabel(/^Үлдэгдэл/).fill("5");
    await page.getByPlaceholder("Түлхүүр (жишээ: Хэмжээ)").fill("Хэмжээ");
    await page.getByPlaceholder("Утга (жишээ: 400мл)").fill("400мл");
    await page.getByRole("button", { name: "Variant үүсгэх" }).click();
    await expect(page.getByText(`${slug}-b`)).toBeVisible({ timeout: 20_000 });

    // 3) Худалдан авагчийн тал: сонгогч гарч ирж, үнэ солигдох ёстой.
    await page.goto(`/product/${slug}`);
    const picker = page.getByRole("radiogroup", { name: "Хувилбар сонгох" });
    await expect(picker).toBeVisible({ timeout: 20_000 });
    const options = picker.getByRole("radio");
    expect(await options.count()).toBe(2);

    const priceLocator = page.locator("main strong").first();
    const firstPrice = ((await priceLocator.textContent()) ?? "").trim();
    await options.nth(1).click();
    await expect.poll(async () => ((await priceLocator.textContent()) ?? "").trim(), { timeout: 15_000 }).not.toBe(firstPrice);
    const secondPrice = ((await priceLocator.textContent()) ?? "").trim();
    expect(secondPrice.replace(/\D/g, "")).toContain("25000".slice(0, 2)); // 25,000₮

    // 4) Сонгосон variant яг тэр чигтээ сагсанд орох ёстой.
    await page.getByRole("button", { name: /Сагсанд нэмэх/ }).filter({ visible: true }).first().click();
    await page.getByRole("button", { name: /Сагс нээх/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name })).toBeVisible();
    // ⚠️ Шошгыг ЭНЭ барааны мөрөн дотор шалгана, сагс даяар биш (2026-09-16).
    // Сагс нь хэрэглэгчид тогтмол хадгалагддаг тул өмнөх УНАСАН ажиллалтын
    // үлдэгдэл ижил "Хэмжээ: 400мл" шошготой мөр үлдээж, шалгалт "2 элемент
    // олдлоо" гээд унадаг байв — бодит алдаа нь аль хэдийн өнгөрсөн, харин
    // буруутгагдах нь дараагийн ажиллалт болно. Мөрөөр хүрээлснээр үлдэгдэл
    // хамаагүй болж, шалгалтын утга нь ч хатуурна: шошго яг тэр бараанд.
    const cartRow = drawer.locator("div.border-b").filter({ has: page.getByRole("heading", { name }) });
    await expect(cartRow.getByText("Хэмжээ: 400мл")).toBeVisible();

    // 5) Цэвэрлэгээ: сагсыг хоослоод, барааг устгана.
    await drawer.getByRole("button", { name: `${name} — сагснаас хасах` }).click();
    await expect(drawer.getByText("Сагс хоосон байна")).toBeVisible();
    await page.goto("/admin");
    await openAdminSection(page, "Бүтээгдэхүүн");
    await page.getByPlaceholder("Нэр, SKU хайх").fill(name);
    await page.getByRole("button", { name: `${name} устгах` }).click();
    await acceptConfirm(page);
    await expect(page.getByRole("button", { name: `${name} устгах` })).toHaveCount(0, { timeout: 20_000 });
  });
});
