import { expect, test } from "./helpers/fixtures";

/**
 * /shop-ийн хайлт / ангилал / хуудаслалт — мөн тэдгээрийн URL дэх төлөв.
 *
 * Энэ нь 2026-08-28-ны бодит алдааны регрессийн тест: тухайн үед хайлт,
 * ангилал, хуудасны дугаар зөвхөн React state-д байсан тул refresh хийхэд
 * эсвэл бараа харчихаад буцахад бүгд тэглэгдэж, худалдан авагч эхнээс нь
 * эхэлдэг байв (docs/HISTORY.md, "Navigation state fix"). Одоо URL-д
 * хадгалагддаг — үүнийг хөтөч дээр бодитоор дарж байж л батлах боломжтой.
 */
test.describe("дэлгүүрийн хөтлөлт", () => {
  test("каталог ачаалагдаж, бараа харагдана", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".shop-product-card").first()).toBeVisible();
    expect(await page.locator(".shop-product-card").count()).toBeGreaterThan(1);
  });

  test("хайлт URL-д бичигдэж, refresh-ийг давна", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".shop-product-card").first()).toBeVisible();
    // Толгой хэсгийн хайлт мөн ижил placeholder-тай тул дэлгүүрийн
    // хайлтын самбарт хүрээлнэ.
    const search = page.locator(".shop-search-panel input");
    await search.fill("cream");
    // Хайлт нь debounce-той (Shop.tsx) тул URL шинэчлэгдэхийг хүлээнэ.
    // URL-ийн параметр нь "q" (толгойн хайлтын /shop?q=… холбоостой ижил).
    await expect.poll(() => new URL(page.url()).searchParams.get("q"), { timeout: 15_000 }).toBe("cream");
    await page.reload();
    await expect(search).toHaveValue("cream");
  });

  test("ангиллын шүүлтүүр URL-д хадгалагдана", async ({ page }) => {
    await page.goto("/shop");
    const pills = page.locator(".shop-filter-pills").first().locator("button");
    await expect(pills.first()).toBeVisible();
    // Эхнийх нь "Бүгд" тул хоёр дахийг сонгоно.
    const chosen = pills.nth(1);
    const label = (await chosen.textContent())?.trim() ?? "";
    await chosen.click();
    await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe(label);
    await page.reload();
    await expect(page.locator(".shop-filter-pills").first().locator("button.active")).toHaveText(label);
  });

  test("хуудаслалт URL-д хадгалагдаж, барааны хуудаснаас буцахад сэргэнэ", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".shop-product-card").first()).toBeVisible();
    const pager = page.locator(".shop-pagination");
    test.skip(!(await pager.count()), "Энэ каталогт нэг л хуудас байна.");

    // keepPreviousData (Shop.tsx): 2-р хуудсыг ачаалах хооронд 1-р хуудасны
    // картууд дэлгэцэн дээр үлддэг тул "Дараах"-ын дараа шууд уншвал ХУУЧИН
    // нэрийг барьж авна. Grid бодитоор солигдохыг хүлээнэ.
    const firstOnPageOne = ((await page.locator(".shop-product-card h2").first().textContent()) ?? "").trim();
    await pager.getByRole("button", { name: /Дараах|Next/i }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBe("2");
    await expect.poll(async () => ((await page.locator(".shop-product-card h2").first().textContent()) ?? "").trim(), { timeout: 15_000 })
      .not.toBe(firstOnPageOne);
    const firstOnPageTwo = await page.locator(".shop-product-card h2").first().textContent();

    // Бараа руу орж, дараа нь буцах: хуудас 2 хэвээр байх ёстой.
    await page.locator(".shop-product-card .shop-product-link").first().click();
    await expect(page).toHaveURL(/\/product\//);
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBe("2");
    // Буцаж ирэхэд эхлээд 1-р хуудас түр харагдаад дараа нь сэргэдэг тул
    // тогтсон утгыг нь хүлээнэ.
    await expect.poll(async () => ((await page.locator(".shop-product-card h2").first().textContent()) ?? "").trim(), { timeout: 15_000 })
      .toBe((firstOnPageTwo ?? "").trim());
  });

  test("эрэмбэ, арьсны төрөл, нөөцийн шүүлтүүр URL-д хадгалагдана", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".shop-product-card").first()).toBeVisible();
    await page.locator(".sort-control select").selectOption("price-low");
    await page.locator(".stock-toggle input[type=checkbox]").check();
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("price-low");
    await expect.poll(() => new URL(page.url()).searchParams.get("inStock")).toBe("1");
    await page.reload();
    await expect(page.locator(".sort-control select")).toHaveValue("price-low");
    await expect(page.locator(".stock-toggle input[type=checkbox]")).toBeChecked();
  });

  test("барааны breadcrumb дэлгүүр рүү буцаана", async ({ page }) => {
    await page.goto("/shop");
    await page.locator(".shop-product-card .shop-product-link").first().click();
    await expect(page).toHaveURL(/\/product\//);
    // exact: true — үгүй бол default дэд-мөрийн тааралт нь толгойн "SUGI
    // ASAYAKE дэлгүүр" холбоосыг олж, нүүр хуудас руу аваачна.
    await page.getByRole("link", { name: "ДЭЛГҮҮР", exact: true }).click();
    await expect(page).toHaveURL(/\/shop/);
  });
});
