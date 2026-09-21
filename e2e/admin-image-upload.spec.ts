import sharp from "sharp";
import type { Page, Route } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";
import { signInAs } from "./helpers/session";
import { openAdminSection } from "./helpers/admin";

/**
 * Admin-ий зураг оруулах урсгал — бодит хөтөч дээр (2026-09-21).
 *
 * Шалгах гурван зүйл, гурвуулаа хэрэглэгчийн байрнаас:
 *   1. Upload товчны хажууд ЗӨВЛӨМЖ харагдана (Tom: "tips zaawar iig bas
 *      martalgui nemeerei").
 *   2. Том утасны зургийг ХӨТӨЧ ДЭЭР нь жижгэрүүлж илгээнэ — 4000px-ийн зураг
 *      сервер рүү 2560px-ээс ихгүй, жижиг файл болж очно.
 *   3. Хэлбэр таарахгүй бол (хэвтээ 2:1 бараа) тайрагдах тухай сануулна.
 *
 * Сервер рүү ЮУ Ч бичихгүй: upload хүсэлтийг замд нь барьж, агуулгыг нь
 * шалгаад хуурамч амжилттай хариу өгнө — R2-д тестийн зураг үлдэхгүй.
 */
type Captured = { contentType: string; bytes: Buffer };

async function interceptUpload(page: Page): Promise<Captured[]> {
  const seen: Captured[] = [];
  await page.route("**/api/trpc/admin.uploadProductImage**", async (route: Route) => {
    const body = route.request().postDataJSON() as Record<string, { json: { contentType: string; dataBase64: string } }>;
    const input = (body["0"] ?? Object.values(body)[0]).json;
    const raw = input.dataBase64.includes(",") ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1) : input.dataBase64;
    seen.push({ contentType: input.contentType, bytes: Buffer.from(raw, "base64") });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ result: { data: { json: { url: "/images/brand/sugi-logo.webp", key: "e2e-fake" } } } }]),
    });
  });
  return seen;
}

/** Шахагдахгүй, бодит утасны зургийн хэмжээтэй (олон MB) зураг. */
async function phonePhoto(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2654435761) >>> 24;
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

async function openNewProduct(page: Page, baseURL: string) {
  await signInAs(page.context(), "admin", baseURL);
  await page.goto("/admin");
  await openAdminSection(page, "Бүтээгдэхүүн");
  await page.getByRole("button", { name: "Бүтээгдэхүүн нэмэх" }).click();
}

test.describe("admin — зураг оруулах", () => {
  test("upload-ийн хажууд барааны зургийн зөвлөмж харагдана", async ({ page, baseURL }) => {
    await openNewProduct(page, baseURL!);
    const tips = page.locator(".upload-tips").filter({ hasText: "Барааны зураг оруулах зөвлөмж" });
    await expect(tips).toBeVisible();
    await expect(tips).toContainText("дөрвөлжин (1:1) эсвэл босоо 4:5");
    await expect(tips).toContainText("Автоматаар");
  });

  test("4000px утасны зургийг илгээхээс өмнө хөтөч дээр жижгэрүүлнэ", async ({ page, baseURL }) => {
    const captured = await interceptUpload(page);
    await openNewProduct(page, baseURL!);
    const original = await phonePhoto(4000, 4000);
    expect(original.length, "тестийн зураг жинхэнэ том байх ёстой").toBeGreaterThan(2 * 1024 * 1024);

    await page.locator('form input[type="file"][accept*="image/"]').first().setInputFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: original });
    await expect(page.getByText("Зургийг илгээхээс өмнө жижгэрүүлэв")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => captured.length, { timeout: 20_000 }).toBe(1);

    const sent = captured[0];
    const meta = await sharp(sent.bytes).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(2560);
    expect(sent.bytes.length).toBeLessThan(original.length);
    // Chromium нь canvas-аас WebP кодолдог (Safari нь JPEG руу унана — код тэр салааг хамгаална).
    expect(sent.contentType).toBe("image/webp");
  });

  test("хэвтээ 2:1 барааны зурагт тайрагдах тухай сануулна", async ({ page, baseURL }) => {
    await interceptUpload(page);
    await openNewProduct(page, baseURL!);
    const wide = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "#e9f0f2" } }).jpeg().toBuffer();
    await page.locator('form input[type="file"][accept*="image/"]').first().setInputFiles({ name: "wide.jpg", mimeType: "image/jpeg", buffer: wide });
    await expect(page.getByText(/тайрагдана/)).toBeVisible({ timeout: 20_000 });
  });
});
