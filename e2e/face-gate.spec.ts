import { eq } from "drizzle-orm";
import { expect, test } from "./helpers/fixtures";
import { adminAuditLogs, faceEnrollments, loginAttempts, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { hashPassword } from "../server/_core/password";
import { FACE_MODEL_VERSION } from "../shared/face-auth";
import { E2E_MARKER } from "./helpers/environment";
import { ensureE2EUser, signInAs } from "./helpers/session";

/**
 * /admin: PASSWORD -> face -> admin (2026-09-22).
 *
 * Tom: "эхлээд passwordoo hiicheed daraan nuur tanih system garj ireed tgd
 * nuuree taniulchaad admin uruu nevtreh ystoi... odoo nuuts ug edr
 * shaardahgui zgr nuuree taniadl orj baina". The session cookie lives a year,
 * so a signed-in admin went straight to the camera. This spec checks it from
 * where the admin actually stands -- a browser that is already signed in
 * (signInAs never enters a password) opening /admin:
 *   1. the password screen comes FIRST, before the camera/phone choice;
 *   2. a wrong password is reported ON the field (WCAG 3.3.1), not a toast;
 *   3. the right one leads to the choice;
 * and that the phone's QR approval page is styled when opened cold (it had no
 * stylesheet at all until face.css was split out of admin.css).
 *
 * The face itself is not tested here -- no automated browser can show a real
 * face; the server tests cover the match and the blink rule.
 *
 *   $env:E2E_FACE_GATE="1"; pnpm e2e e2e/face-gate.spec.ts
 */
const gateOn = process.env.E2E_FACE_GATE === "1";

test.describe("admin: нууц үг -> царай", () => {
  test.skip(!gateOn, "E2E_FACE_GATE=1 шаардлагатай (хаалга асаалттай сервер, 3101 порт).");

  test("нэвтэрсэн admin /admin нээхэд эхлээд нууц үг асууна; буруу нь талбар дээр, зөв нь аргаа сонгох руу", async ({ page, context, baseURL }) => {
    const admin = await ensureE2EUser("admin");
    const db = await getDb();
    // The choice screen is only offered to someone already enrolled.
    await db!.delete(faceEnrollments).where(eq(faceEnrollments.userId, admin.id));
    await db!.insert(faceEnrollments).values({
      userId: admin.id,
      descriptorJson: JSON.stringify(Array.from({ length: 128 }, () => 0.01)),
      sampleCount: 5,
      modelVersion: FACE_MODEL_VERSION,
      consentedAt: new Date(),
    });

    try {
      await signInAs(context, "admin", baseURL!);
      await page.goto("/admin");

      // 1) Password first: nothing about the camera yet.
      await expect(page.getByRole("heading", { level: 1, name: "Нууц үгээ оруулна уу" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Энэ төхөөрөмжөөр баталгаажуулах/ })).toHaveCount(0);
      const field = page.locator("#admin-password");
      await expect(field).toBeFocused();

      // 2) Wrong password -> the message is on the field itself.
      await field.fill("definitely-not-the-password");
      await page.getByRole("button", { name: "Үргэлжлүүлэх" }).click();
      await expect(page.locator("#admin-password-error")).toHaveText("Нууц үг буруу байна.");
      await expect(field).toHaveAttribute("aria-invalid", "true");

      // 3) Right password -> the camera/phone choice.
      await field.fill(`${E2E_MARKER}-password-admin`);
      await page.getByRole("button", { name: "Үргэлжлүүлэх" }).click();
      await expect(page.getByRole("button", { name: /Энэ төхөөрөмжөөр баталгаажуулах/ })).toBeVisible({ timeout: 15_000 });

      // A reload in the SAME tab before the face check keeps the step (it
      // lives 10 minutes, and is used up only by a PASSED face check).
      await page.reload();
      await expect(page.getByRole("button", { name: /Энэ төхөөрөмжөөр баталгаажуулах/ })).toBeVisible({ timeout: 15_000 });

      // A NEW tab has a new tab id: password again.
      const second = await context.newPage();
      await second.goto("/admin");
      await expect(second.getByRole("heading", { level: 1, name: "Нууц үгээ оруулна уу" })).toBeVisible();
      await second.close();
    } finally {
      await db!.delete(faceEnrollments).where(eq(faceEnrollments.userId, admin.id));
    }
  });

  test("/login маягтаар нууц үгээ оруулаад /admin руу ороход ч /admin-ий нууц үгийн дэлгэц гарна (Tom-ийн туршсан зам)", async ({ page }) => {
    // 2026-09-22, Tom after testing the first version: "zuwhun face unshij
    // baina, password garj irehgui baina". The server log showed exactly
    // this path twice: /login with the password, then /admin -> face only,
    // because a sign-in used to count as the /admin password step.
    const db = await getDb();
    const phone = `7${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    const password = `${E2E_MARKER}-login-form-password`;
    await db!.insert(users).values({ name: `${E2E_MARKER} login-form admin`, phone, email: `${E2E_MARKER}-login-form-${Date.now()}@example.invalid`, passwordHash: await hashPassword(password), role: "admin" });
    const [created] = await db!.select().from(users).where(eq(users.phone, phone)).limit(1);
    await db!.insert(faceEnrollments).values({ userId: created.id, descriptorJson: JSON.stringify(Array.from({ length: 128 }, () => 0.01)), sampleCount: 5, modelVersion: FACE_MODEL_VERSION, consentedAt: new Date() });
    try {
      await page.goto("/login?redirect=%2Fadmin");
      await page.locator("#login-phone").fill(phone);
      await page.locator("#login-password").fill(password);
      await page.locator("button.auth-submit").first().click();
      await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1, name: "Нууц үгээ оруулна уу" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /Энэ төхөөрөмжөөр баталгаажуулах/ })).toHaveCount(0);
    } finally {
      await db!.delete(faceEnrollments).where(eq(faceEnrollments.userId, created.id));
      await db!.delete(loginAttempts).where(eq(loginAttempts.userId, created.id));
      await db!.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, created.id));
      await db!.delete(users).where(eq(users.id, created.id));
    }
  });

  test("утасны QR батлах хуудас (/face-approve) шууд нээхэд загвартай харагдана", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin", baseURL!);
    // A token that matches nothing: the page shows its "invalid code" card --
    // enough to prove the card is styled, which is what was broken.
    await page.goto("/face-approve?token=e2e-not-a-real-token-000000");
    const card = page.locator(".face-approve-card");
    await expect(card).toBeVisible();
    const style = await card.evaluate(el => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderTopLeftRadius, background: cs.backgroundColor, maxWidth: cs.maxWidth };
    });
    expect(style.radius, "face.css ачаалагдаагүй бол булан 0px").toBe("18px");
    expect(style.maxWidth).toBe("420px");
    expect(style.background).toBe("rgb(255, 255, 255)");
  });
});
