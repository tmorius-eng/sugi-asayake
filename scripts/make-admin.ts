import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { normalizePhoneForVerifyMn } from "../server/verifyMn";
import { users } from "../drizzle/schema";

/**
 * Хэрэглэгчид `admin` эрх олгоно — СЕРВЕРТ/DB-д хандах эрхтэй хүний гар үйлдэл.
 *
 *   pnpm exec tsx scripts/make-admin.ts <утас> --yes         # production (.env-ийн DATABASE_URL), --yes заавал
 *   pnpm exec tsx scripts/make-admin.ts <утас> --staging     # sugi_staging
 *   pnpm exec tsx scripts/make-admin.ts <утас> --dry-run     # зөвхөн юу өөрчлөгдөхийг харуулна
 *
 * Яагаад (2026-10-01, аюулгүй байдлын scan #16, #21): "хамгийн эхний хэрэглэгч
 * автоматаар admin" дүрэм кодоос ХАСАГДСАН — count-аар шалгаад insert хийх нь race-тэй,
 * хоосон DB дээр (шинэ эзэн, staging хуулбар, CI) хэн түрүүлж бүртгүүлсэн нь admin
 * болдог байв. Шинэ суурилуулалтад: эхлээд /register-ээр ердийн данс үүсгэж,
 * дараа нь энэ скриптээр admin болгоно.
 *
 * Аюулгүй байдал: админ эрх зөвхөн DB-д хандах эрхтэй хүнд л олгогдоно (вэбээр БИШ).
 * Олдохгүй хэрэглэгчийг үүсгэхгүй, зөвхөн байгааг дэвшүүлнэ. `sessionVersion`-ийг +1
 * болгодог тул тухайн хэрэглэгчийн бүх одоогийн сешн хүчингүй болж, дахин нэвтэрнэ
 * (шинэ эрх сешн кэшэд бүдгэрэхгүй). Дараа нь /admin дээр нууц үг + царай (step-up).
 */

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const staging = args.includes("--staging");
const confirmed = args.includes("--yes");
const rawPhone = args.find(arg => !arg.startsWith("--"));

if (!rawPhone) {
  console.error("Хэрэглэх: pnpm exec tsx scripts/make-admin.ts <утас> [--staging] [--dry-run] [--yes]");
  process.exit(2);
}
const phone = normalizePhoneForVerifyMn(rawPhone);
if (!phone) {
  console.error(`"${rawPhone}" зөв утасны дугаар биш (8 оронтой монгол дугаар).`);
  process.exit(2);
}

if (staging && process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/sugi_staging";
  process.env.DATABASE_URL = url.toString();
}

const db = await getDb();
if (!db) {
  console.error("DATABASE_URL тохируулаагүй эсвэл өгөгдлийн сан холбогдсонгүй.");
  process.exit(1);
}

const [schemaRow] = (await db.execute(sql`SELECT DATABASE() AS name`) as unknown as [{ name: string }[]])[0];
console.log(`Өгөгдлийн сан: ${schemaRow?.name ?? "?"}${dryRun ? " (dry-run)" : ""}`);
// Бодит дэлгүүрийн схем дээр санамсаргүй нэг командаар admin олгохгүйн тулд `--yes` заавал.
if (!dryRun && !confirmed && !staging) {
  console.error(`"${schemaRow?.name ?? "?"}" нь staging биш. Юу өөрчлөгдөхийг эхлээд --dry-run-аар харж, дараа нь --yes нэмж ажиллуулна уу.`);
  process.exit(2);
}

const [user] = await db.select({ id: users.id, name: users.name, role: users.role, suspendedAt: users.suspendedAt }).from(users).where(eq(users.phone, phone)).limit(1);
if (!user) {
  console.error(`${phone} дугаартай хэрэглэгч олдсонгүй. Эхлээд сайтаар бүртгүүлнэ үү (скрипт данс үүсгэдэггүй).`);
  process.exit(1);
}
if (user.suspendedAt) {
  console.error(`#${user.id} түр хаагдсан байна — эхлээд сэргээнэ үү.`);
  process.exit(1);
}
if (user.role === "admin") {
  console.log(`#${user.id} ${user.name ?? ""} аль хэдийн admin байна — юу ч өөрчлөхгүй.`);
  process.exit(0);
}

console.log(`#${user.id} ${user.name ?? "(нэргүй)"}: ${user.role} -> admin`);
if (dryRun) process.exit(0);

await db.update(users).set({ role: "admin", sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, user.id));
const [after] = await db.select({ role: users.role, sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, user.id)).limit(1);
console.log(`Дууслаа: role=${after?.role}, sessionVersion=${after?.sessionVersion}. Хэрэглэгч дахин нэвтэрнэ.`);
process.exit(0);
