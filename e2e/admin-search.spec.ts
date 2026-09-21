import { expect, test } from "./helpers/fixtures";
import { acceptConfirm } from "./helpers/confirm";
import { signInAs } from "./helpers/session";
import { openAdminSection } from "./helpers/admin";

/**
 * Admin → Хайлт (2026-09-20): статистик, синонимын толь, брэндийн alias — бүгд
 * data-driven. Синоним нэмээд "Туршиж үзэх"-д шууд тусахыг хөтөч дээр батална
 * (индекс дахин баригддаг эсэх). Бичилт `sugi_staging`-д, marker-тэй, төгсгөлд
 * устгана.
 */
test.describe("admin — хайлт", () => {
  test("синоним нэмэхэд хайлт шууд өөрчлөгдөнө", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin", baseURL!);
    await page.goto("/admin");
    await openAdminSection(page, "Хайлт");
    // Хуудасны гарчиг: шинэ хэсэг нэмэхэд AdminWorkspace-ийн гарчгийн гинжид
    // бичихээ мартвал fallback ("Хэрэглэгч ба эрх") гарч ирдэг — 2026-09-20-нд
    // яг ингэж мартсаныг барьсан тул энэ шалгалт үлдэнэ.
    await expect(page.getByRole("heading", { level: 1, name: "Хайлт ба толь бичиг" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Статистик" })).toBeVisible();
    await page.getByRole("button", { name: "Синонимын толь" }).click();

    const nonsense = `zqvx${Date.now().toString().slice(-6)}`;
    const probe = page.getByPlaceholder("Худалдан авагч шиг бичээд үзнэ үү");
    await probe.fill(nonsense);
    await expect(page.getByText(/^0 бараа/)).toBeVisible({ timeout: 15_000 });

    // Утгагүй үгийг "shampoo"-ийн синоним болгоно → шампунь олдох ёстой.
    await page.getByPlaceholder("жишээ: батга").fill(nonsense);
    await page.getByPlaceholder("батга, батганы, тууралт, acne, pimple").fill(`${nonsense}, shampoo, шампунь`);
    await page.getByRole("button", { name: "Хадгалах" }).click();
    await expect(page.getByText(/Синоним хадгалагдлаа/)).toBeVisible({ timeout: 15_000 });
    await probe.fill(`${nonsense} `);
    await probe.fill(nonsense);
    await expect(page.getByText(/^[1-9]\d* бараа/)).toBeVisible({ timeout: 20_000 });

    // Цэвэрлэгээ: жагсаалтаас устгана.
    const row = page.locator("div").filter({ has: page.getByText(nonsense, { exact: true }) }).getByRole("button", { name: "Устгах" }).first();
    await row.click();
    await acceptConfirm(page);
    await expect(page.getByText(/Устгагдлаа/)).toBeVisible({ timeout: 15_000 });
  });

  test("брэндийн alias таб бодит брэндүүдийг санал болгоно", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin", baseURL!);
    await page.goto("/admin");
    await openAdminSection(page, "Хайлт");
    await page.getByRole("button", { name: "Брэндийн alias" }).click();
    await expect(page.getByText("БРЭНД → БИЧЛЭГИЙН ХУВИЛБАРУУД")).toBeVisible();
    // Сонголтууд нь tRPC-ийн хариугаар дүүрдэг тул дахин оролддог assertion
    // хэрэгтэй — нэг удаагийн `count()` нь query ирэхээс өмнө уншиж байв.
    const select = page.getByLabel("Үндсэн брэнд");
    await expect(select).toBeVisible();
    await expect.poll(() => select.locator("option").count(), { timeout: 20_000 }).toBeGreaterThan(1);
  });
});
