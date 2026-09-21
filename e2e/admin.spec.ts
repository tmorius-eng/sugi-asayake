import { expect, test } from "./helpers/fixtures";
import { acceptConfirm } from "./helpers/confirm";
import { E2E_MARKER } from "./helpers/environment";
import { ensureE2EUser, signInAs } from "./helpers/session";
import { openAdminSection } from "./helpers/admin";

/**
 * /admin — эрхийн хаалга ба бүтээгдэхүүний бодит CRUD.
 *
 * Царайны хаалга нь бодит камер шаарддаг тул E2E серверт л унтраагдсан
 * (playwright.config.ts-ийн webServer.env) — production дээрх хаалга
 * хөндөгдөхгүй. Эрхийн шалгалт (`adminProcedure` гэх мэт) хэвээрээ ажиллана,
 * доорх "энгийн хэрэглэгч" тест яг үүнийг батална.
 *
 * Бүх бичилт `sugi_staging` схемд явна (e2e/helpers/environment.ts).
 */

test.describe("admin", () => {
  test("энгийн хэрэглэгч admin панелийг харахгүй", async ({ page, context, baseURL }) => {
    await signInAs(context, "user", baseURL!);
    await page.goto("/admin");
    // Панель нь хэрэглэгчийг storefront руу буцаах эсвэл татгалзсан төлөв
    // харуулах ёстой — ямар ч тохиолдолд удирдлагын самбар РЕНДЕР ХИЙГДЭХГҮЙ
    // (өргөнөөс үл хамаарах шалгуур: гарчиг ба цэсний товч хоёулаа байхгүй).
    await expect(page.getByRole("heading", { level: 1, name: "Хянах самбар" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Цэс нээх" })).toHaveCount(0);
  });

  test("admin нэвтэрч, хэсгүүд хооронд шилжинэ", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin", baseURL!);
    await page.goto("/admin");
    // Хянах самбарын h1 нь зөвхөн дэлгэц уншигчид зориулагдсан (sr-only).
    await expect(page.getByRole("heading", { level: 1, name: "Хянах самбар" })).toHaveCount(1);

    await openAdminSection(page, "Бүтээгдэхүүн");
    await expect(page.getByRole("heading", { level: 1, name: "Бүтээгдэхүүний сан" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Бүтээгдэхүүн нэмэх" })).toBeVisible();

    await openAdminSection(page, "Захиалга");
    // Хуудасны гарчиг нь хэсгийн нэрнээс ялгаатай ("Захиалгын гүйцэтгэл").
    await expect(page.getByRole("heading", { level: 1, name: "Захиалгын гүйцэтгэл" })).toBeVisible();
    await expect(page.getByPlaceholder("Дугаар, хэрэглэгч, утас хайх")).toBeVisible();

    // Хэрэглэгчийн хэсэг нь энэ төсөлд "хэзээ ч шалгагдаагүй" гэж
    // тэмдэглэгдсэн байсан (docs/PROJECT-GUIDE.md) — ядаж ачаалагдаж, эрх
    // солих удирдлага гарч ирж байгааг энд барина.
    await openAdminSection(page, "Хэрэглэгч");
    await expect(page.getByLabel("Эрх").first()).toBeVisible();
  });

  test("бүтээгдэхүүн үүсгэж, жагсаалтаас олоод, устгана", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin", baseURL!);
    await page.goto("/admin");
    await openAdminSection(page, "Бүтээгдэхүүн");

    const stamp = Date.now().toString(36);
    const name = `${E2E_MARKER} бараа ${stamp}`;
    await page.getByRole("button", { name: "Бүтээгдэхүүн нэмэх" }).click();
    await page.getByLabel("Нэр", { exact: true }).fill(name);
    await page.getByLabel("SKU", { exact: true }).fill(`${E2E_MARKER}-${stamp}`);
    await page.getByLabel("Үнэ (₮)", { exact: true }).fill("12000");
    // getByLabel("Ангилал") ажиллахгүй: <label> нь <select>-ээ ӨӨРТӨӨ агуулдаг
    // тул хүртээмжийн нэр нь бүх <option>-ийн текстийг залгисан байдаг.
    const category = page.locator("form select").first();
    const value = await category.locator("option:not([disabled])").first().getAttribute("value");
    await category.selectOption(value!);
    await page.getByRole("button", { name: "Бүтээгдэхүүн үүсгэх" }).click();

    // Зөвхөн "нэр хаа нэгтээ харагдаж байна" гэдэг хангалтгүй: үүсгэсний дараа
    // гарах toast мөн нэрийг агуулдаг. Жагсаалтын хайлтаар шүүж, тухайн мөрийн
    // ӨӨРИЙН үйлдлийн товчийг олдог эсэхээр батална.
    await page.getByPlaceholder("Нэр, SKU хайх").fill(name);
    const deleteButton = page.getByRole("button", { name: `${name} устгах` });
    await expect(deleteButton).toBeVisible({ timeout: 20_000 });

    // Цэвэрлэгээ нь тестийн нэг хэсэг: staging ч гэсэн хог хураах ёсгүй.
    await deleteButton.click();
    await acceptConfirm(page);
    await expect(deleteButton).toHaveCount(0, { timeout: 20_000 });
  });
});

/**
 * Хэрэглэгчийн удирдлага — docs/PROJECT-GUIDE.md-д "хэзээ ч шалгагдаагүй" гэж
 * тэмдэглэгдсэн цорын ганц хэсэг байсан. Эрх солих, түр хаах/сэргээх нь
 * дэлгүүрийн хамгийн эрсдэлтэй удирдлагууд (ажилтны хандалт) тул бодит
 * дараалалаар шалгана. Бүх бичилт `sugi_staging`-д.
 */
test.describe("admin — хэрэглэгчийн удирдлага", () => {
  test("эрх солих, буцаах", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin", baseURL!);
    const target = await ensureE2EUser("user");
    await page.goto("/admin");
    await openAdminSection(page, "Хэрэглэгч");

    await page.getByPlaceholder("Нэр эсвэл имэйл хайх").fill(target.name ?? "");
    const roleSelect = page.getByLabel("Эрх").first();
    await expect(roleSelect).toBeVisible();
    await expect(roleSelect).toHaveValue("user");

    await roleSelect.selectOption("staff");
    await expect(roleSelect).toHaveValue("staff");
    // Дахин ачаалахад сервер дээр бодитоор хадгалагдсан эсэх.
    await page.reload();
    await openAdminSection(page, "Хэрэглэгч");
    await page.getByPlaceholder("Нэр эсвэл имэйл хайх").fill(target.name ?? "");
    await expect(page.getByLabel("Эрх").first()).toHaveValue("staff");

    await page.getByLabel("Эрх").first().selectOption("user");
    await expect(page.getByLabel("Эрх").first()).toHaveValue("user");
  });

  test("дэлгэрэнгүй цонх: түр хаах, хандалт сэргээх", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin", baseURL!);
    const target = await ensureE2EUser("user");
    await page.goto("/admin");
    await openAdminSection(page, "Хэрэглэгч");
    await page.getByPlaceholder("Нэр эсвэл имэйл хайх").fill(target.name ?? "");

    await page.getByRole("button", { name: "Дэлгэрэнгүй" }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: target.name ?? "" })).toBeVisible();

    // "Түр хаах" нь сайтын өөрийн confirm dialog асуудаг (идэвхтэй session
    // шууд хүчингүй болдог тул зөв) — acceptConfirm батална.
    await drawer.getByRole("button", { name: "Түр хаах" }).click();
    await acceptConfirm(page);
    await expect(drawer.getByRole("button", { name: "Хандалт сэргээх" })).toBeVisible({ timeout: 20_000 });

    // Цэвэрлэгээ: тестийн хэрэглэгч хаалттай үлдэх ёсгүй.
    await drawer.getByRole("button", { name: "Хандалт сэргээх" }).click();
    await expect(drawer.getByRole("button", { name: "Түр хаах" })).toBeVisible({ timeout: 20_000 });

    // Модаль цонх Escape-ээр хаагдана.
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  });
});
