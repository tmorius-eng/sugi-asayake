import { expect, test } from "./helpers/fixtures";
import { signInAs } from "./helpers/session";

/**
 * Профайлын асуулгын шинэ "Биеийн арчилгаа" алхам (2026-09-20). Tom: "бие type
 * хийсэн ч санал буруу" — алхам нь огт байгаагүй. Хэрэглэгчийн байрнаас:
 * /profile → засах → 4 дэх алхам харагдаж, сонголт хадгалагдаж, тоймын чип
 * дээр гарна.
 */
test.describe("профайл — биеийн арчилгаа", () => {
  test("асуулгад биеийн алхам байна, сонголт хадгалагдана", async ({ page, context, baseURL }) => {
    await signInAs(context, "user", baseURL!);
    await page.goto("/profile?tab=preferences");
    // Асуулгыг нээх товч (профайлд аль хэдийн хариулттай бол "засах", үгүй бол "эхлэх").
    // Profile.tsx: хариулттай бол "Профайл засах", үгүй бол "Профайл бөглөх".
    const opener = page.getByRole("button", { name: /Профайл (засах|бөглөх)/ }).first();
    await expect(opener).toBeVisible({ timeout: 20_000 });
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // 1 → 2 → 3 → 4: "Биеийн арчилгаа"
    for (let i = 0; i < 3; i++) await dialog.getByRole("button", { name: /Дараах|Алгасах/ }).first().click();
    await expect(dialog.getByRole("heading", { name: /Биеийн арчилгаа/ })).toBeVisible();
    // Pill нь toggle тул өмнөх ажиллалтын хадгалсан утга дээр дахин дарвал
    // УНТРААНА — aria-pressed-ээр нь шалгаж, хэрэгтэй үед л дарна.
    const choose = async (name: string | RegExp) => {
      const pill = dialog.getByRole("button", { name, exact: typeof name === "string" });
      if ((await pill.getAttribute("aria-pressed")) !== "true") await pill.click();
      await expect(pill).toHaveAttribute("aria-pressed", "true");
    };
    await choose("Хуурай");
    await choose(/Хуурайшилт, хагарал/);
    // Тойм хүртэл алгасаад дуусгана.
    for (let i = 0; i < 4; i++) await dialog.getByRole("button", { name: /Дараах|Алгасах/ }).first().click();
    await expect(dialog.getByText(/Бие: Хуурай/)).toBeVisible();
    await dialog.getByRole("button", { name: "Дуусгах" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("Биеийн арчилгаа").first()).toBeVisible();
    await expect(page.getByText(/Хуурайшилт, хагарал/).first()).toBeVisible();
  });
});
