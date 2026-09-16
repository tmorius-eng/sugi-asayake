import { expect, test } from "./helpers/fixtures";

/**
 * Сайтыг апп болгон суулгах зам — бүрэн гинж хөтөч дээр (2026-09-16).
 *
 * Tom: *"Ene website aa pc desktop deer install app feature eer install
 * hiigeed bas utsan deeree install hiideg bolgmoor bainaaa"*.
 *
 * Энэ тест хоёр тусдаа зүйлийг шалгана, учир нь хоёулаа тусдаа эвдэрдэг:
 *   1. **Хөтөч суулгахыг зөвшөөрөх нөхцөл** — manifest бодитоор хүрэгдэж,
 *      шаардлагатай талбарууд болон 192/512 дүрснүүд нь үнэхээр татагдаж
 *      байна уу. Нэг дүрэс 404 өгвөл Chrome суулгах саналыг чимээгүй
 *      хаадаг, хуудас дээр ямар ч алдаа харагдахгүй.
 *   2. **Бидний өөрсдийн товч** — Android дээр хөтөч өөрөө урьдаггүй,
 *      iOS дээр эвент огт байдаггүй тул товчгүйгээр суулгах арга байхгүй.
 */

test.describe("аппаар суулгах", () => {
  test("manifest болон дүрснүүд бодитоор хүрэгдэнэ (суулгах нөхцөл)", async ({ page, request, baseURL }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href, "index.html-д manifest холбоос байх ёстой").toBeTruthy();

    const response = await request.get(new URL(href!, baseURL!).toString());
    expect(response.status()).toBe(200);
    const manifest = JSON.parse(await response.text()) as {
      name: string; short_name: string; start_url: string; display: string;
      icons: { src: string; sizes: string; purpose?: string }[];
      screenshots?: { src: string; form_factor?: string }[];
    };

    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.short_name.length).toBeGreaterThan(0);
    expect(manifest.start_url.startsWith("/")).toBe(true);
    // Chrome/Edge нь standalone эсвэл түүнээс "апп шиг" горим шаардана.
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(manifest.display);

    const sizes = manifest.icons.map(icon => icon.sizes);
    expect(sizes, "192x192 дүрс заавал").toContain("192x192");
    expect(sizes, "512x512 дүрс заавал").toContain("512x512");
    expect(manifest.icons.some(icon => icon.purpose === "maskable"), "Android-ын дугуй хүрээнд maskable хэрэгтэй").toBe(true);

    // Хамгийн чимээгүй эвдрэл: manifest зөв атлаа дүрэс нь байхгүй.
    for (const icon of manifest.icons) {
      const iconResponse = await request.get(new URL(icon.src, baseURL!).toString());
      expect(iconResponse.status(), `${icon.src} татагдах ёстой`).toBe(200);
      expect(iconResponse.headers()["content-type"]).toContain("image");
    }

    // Дэлгэцийн зураг нь суулгах цонхыг бүрэн (зурагтай) хэлбэрт оруулдаг —
    // Android-ын "richer install UI"-д narrow, компьютерт wide шаардлагатай.
    const formFactors = (manifest.screenshots ?? []).map(shot => shot.form_factor);
    expect(formFactors).toContain("wide");
    expect(formFactors).toContain("narrow");
    for (const shot of manifest.screenshots ?? []) {
      const shotResponse = await request.get(new URL(shot.src, baseURL!).toString());
      expect(shotResponse.status(), `${shot.src} татагдах ёстой`).toBe(200);
      expect(shotResponse.headers()["content-type"]).toContain("image");
    }
  });

  test("service worker бүртгэгдэж, хуудсыг хамарна", async ({ page }) => {
    await page.goto("/");
    // Бүртгэл нь `load` эвент дээр явагддаг тул түүнийг хүлээнэ.
    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/")
        ?? await new Promise<ServiceWorkerRegistration | undefined>(resolve => {
          const timer = setInterval(async () => {
            const found = await navigator.serviceWorker.getRegistration("/");
            if (found) { clearInterval(timer); resolve(found); }
          }, 250);
          setTimeout(() => { clearInterval(timer); resolve(undefined); }, 10_000);
        });
      return registration?.scope ?? null;
    });
    expect(scope, "sw.js нь / хамрах хүрээтэй бүртгэгдэх ёстой").toContain("/");
  });

  test("хөтөч зөвшөөрөхөд товч гарч, дарахад жинхэнэ суулгах цонх дуудагдана", async ({ page }) => {
    await page.goto("/");
    const button = page.getByRole("button", { name: "Аппаар суулгах" });

    // Эвент ирээгүй байхад товч байх ёсгүй — суулгаж чадахгүй хөтөч дээр
    // ажиллахгүй товч үзүүлэх нь худал амлалт.
    await expect(button).toHaveCount(0);

    // Chrome-ийн `beforeinstallprompt`-ийг дуурайна (жинхэнэ эвентийг
    // автомат хөтөч шиддэггүй — Chrome үүнийг зөвхөн бодит хэрэглэгчийн
    // профайл дээр шиддэг).
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt") as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string; platform: string }> };
      event.prompt = () => { (window as unknown as { __installPrompted?: boolean }).__installPrompted = true; return Promise.resolve(); };
      event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
      window.dispatchEvent(event);
    });

    await expect(button).toBeVisible();
    await button.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __installPrompted?: boolean }).__installPrompted === true)).toBe(true);

    // Зөвшөөрсний дараа эвент зарцуулагдсан тул товч алга болно.
    await expect(button).toHaveCount(0);
  });

  test("татгалзвал гараар суулгах заавар гарна", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt") as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string; platform: string }> };
      event.prompt = () => Promise.resolve();
      event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
      window.dispatchEvent(event);
    });
    await page.getByRole("button", { name: "Аппаар суулгах" }).click();
    await expect(page.getByRole("dialog").getByText("Аппаар суулгах")).toBeVisible();
  });

  test("суулгасны дараа товч өөрөө алга болно", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt") as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string; platform: string }> };
      event.prompt = () => Promise.resolve();
      event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
      window.dispatchEvent(event);
    });
    const button = page.getByRole("button", { name: "Аппаар суулгах" });
    await expect(button).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(button).toHaveCount(0);
  });
});

/**
 * iOS дээр `beforeinstallprompt` ОГТ БАЙХГҮЙ — Safari түүнийг хэрэгжүүлээгүй.
 * Тиймээс товч нь эвентгүйгээр гарч, "Хуваалцах → Нүүр дэлгэцэд нэмэх"
 * гэсэн зааврыг үзүүлэх ёстой. Энэ тестгүйгээр iPhone хэрэглэгч сайтыг
 * хэзээ ч суулгаж чадахгүй байсныг анзаарахгүй өнгөрөх байв.
 */
test.describe("iPhone дээр гараар нэмэх заавар", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });

  test("эвентгүйгээр товч гарч, Хуваалцах зааврыг үзүүлнэ", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Аппаар суулгах" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Нүүр дэлгэцэд нэмэх", { exact: false })).toBeVisible();
    await expect(dialog.getByText("Хуваалцах", { exact: false })).toBeVisible();
  });
});
