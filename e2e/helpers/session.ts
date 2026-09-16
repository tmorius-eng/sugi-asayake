import type { BrowserContext, Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { COOKIE_NAME } from "../../shared/const";
import { users } from "../../drizzle/schema";
import { getDb } from "../../server/db";
import { signSessionToken } from "../../server/_core/context";
import { hashPassword } from "../../server/_core/password";
import { E2E_MARKER } from "./environment";

/**
 * Нэвтэрсэн төлөвийг UI-гаар биш, session cookie-г шууд гаргаж авдаг.
 *
 * Яагаад: бүртгэл ба нэвтрэлт хоёулаа 2 алхамт OTP-тэй (утас/имэйл рүү явдаг
 * бодит код). Ямар ч тест түүнд хариулж чадахгүй тул UI-гаар нэвтрэхийг
 * оролдвол E2E нь эсвэл огт ажиллахгүй, эсвэл OTP-г тойрох "тестийн арын хаалга"
 * аппликейшнд нэмэхэд хүргэнэ — сүүлийнх нь бодит эрсдэл. Оронд нь тест нь
 * аппын ӨӨРИЙН `signSessionToken`-ийг дуудаж, гарсан cookie-г хөтөчид тавина:
 * аппын код хэвээрээ, тест нь зөвхөн "энэ хэрэглэгчээр нэвтэрсэн" гэдгийг
 * богиносгож байна.
 *
 * Хэрэглэгч бүр `sugi_staging` схемд үүсдэг (e2e/helpers/environment.ts нь
 * production схемийг хориглодог) бөгөөд нэр/утсандаа e2e тэмдэг агуулна.
 */
export type E2ERole = "user" | "staff" | "finance" | "marketing" | "warehouse" | "admin";

/** Тухайн үүрэгт зориулсан тогтмол тестийн хэрэглэгч — байвал дахин ашиглана,
 *  байхгүй бол үүсгэнэ. Тогтмол (Date.now биш) учир нь давтан ажиллуулалт бүр
 *  staging руу шинэ хэрэглэгч хураахгүй байх ёстой. */
export async function ensureE2EUser(role: E2ERole) {
  const db = await getDb();
  if (!db) throw new Error("E2E: DB холбогдсонгүй (tunnel асаалттай юу?).");
  const phone = e2ePhoneFor(role);
  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (existing) {
    // Үүрэг нь өөр болсон байж болно (гараар засагдсан, өмнөх run өөр үүрэгтэй
    // үүсгэсэн) — тестийн хүлээлтэд нийцүүлнэ.
    if (existing.role !== role || existing.suspendedAt) {
      await db.update(users).set({ role, suspendedAt: null, suspendedReason: null }).where(eq(users.id, existing.id));
    }
    return { ...existing, role };
  }
  await db.insert(users).values({
    name: `${E2E_MARKER} ${role}`,
    phone,
    email: `${E2E_MARKER}-${role}@example.invalid`,
    passwordHash: await hashPassword(`${E2E_MARKER}-password-${role}`),
    role,
  });
  const [created] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (!created) throw new Error(`E2E: ${role} хэрэглэгч үүсгэсний дараа олдсонгүй.`);
  return created;
}

/** Бодит дугаартай хэзээ ч мөргөлдөхгүй: Монголын дугаар 8 оронтой, энэ нь
 *  "e2e" угтвартай тул форматаараа л ялгарна. */
function e2ePhoneFor(role: E2ERole): string {
  return `${E2E_MARKER}-${role}`;
}

/** Хөтөчийн context-д тухайн үүргийн session cookie тавина. */
export async function signInAs(context: BrowserContext, role: E2ERole, baseURL: string) {
  const user = await ensureE2EUser(role);
  const token = await signSessionToken(user.id, user.sessionVersion);
  const url = new URL(baseURL);
  await context.addCookies([
    {
      name: COOKIE_NAME,
      value: token,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
  return user;
}

/** Cookie-г тавьсны дараа хуудас аль хэдийн нээлттэй байсан бол шинэчилнэ. */
export async function signInOnPage(page: Page, role: E2ERole, baseURL: string) {
  const user = await signInAs(page.context(), role, baseURL);
  await page.reload();
  return user;
}
