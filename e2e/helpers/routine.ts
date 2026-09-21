import { and, eq, gt, inArray } from "drizzle-orm";
import { products, routines, routineSteps } from "../../drizzle/schema";
import { getDb } from "../../server/db";
import { E2E_MARKER } from "./environment";

/**
 * Нийтэлсэн routine (арчилгааны багц) — тестийн өөрийн өгөгдөл (2026-09-21).
 * Staging-д routine огт байхгүй тул `/routine/:slug` хуудсыг хэзээ ч нээж
 * чадахгүй байв. ensureE2EUser-тэй ижил зарчим: E2E_MARKER-тэй мөр, байвал
 * дахин ашиглана; нөөцтэй, нийтэлсэн 2 бараанаас 2 алхамтай.
 *
 * Компьютер ба утасны worker зэрэг дуудна: одоо байгаа алхмууд хүчинтэй бол
 * ХӨНДӨХГҮЙ (устгаад дахин бичвэл нөгөө worker-ийн хуудас хоосон багц харна),
 * анх үүсгэх үеийн давхар insert-ийг уучилна.
 */
export async function ensureE2ERoutine() {
  const db = await getDb();
  if (!db) throw new Error("E2E: DB холбогдсонгүй.");
  const slug = `${E2E_MARKER}-routine`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const load = async () => (await db.select().from(routines).where(eq(routines.slug, slug)).limit(1))[0];

  let routine = await load();
  if (!routine) {
    try {
      await db.insert(routines).values({ name: `${E2E_MARKER} routine`, slug, description: "E2E тестийн арчилгааны багц.", discountPercent: 5, isPublished: true });
    } catch { /* нөгөө worker түрүүлж үүсгэсэн */ }
    routine = await load();
    if (!routine) throw new Error("E2E: routine үүсгэсний дараа олдсонгүй.");
  }

  const steps = await db.select({ productId: routineSteps.productId }).from(routineSteps).where(eq(routineSteps.routineId, routine.id));
  const stepIds = steps.map(step => step.productId);
  const stillValid = stepIds.length >= 2 && (await db.select({ id: products.id }).from(products)
    .where(and(inArray(products.id, stepIds), eq(products.isPublished, true), gt(products.stockQuantity, 0)))).length === stepIds.length;
  if (stillValid) return { ...routine, productIds: stepIds };

  const stocked = await db.select({ id: products.id }).from(products)
    .where(and(eq(products.isPublished, true), gt(products.stockQuantity, 0), eq(products.kind, "physical")))
    .limit(2);
  if (stocked.length < 2) throw new Error("E2E: routine-д хангалттай нөөцтэй бараа алга.");
  await db.delete(routineSteps).where(eq(routineSteps.routineId, routine.id));
  await db.insert(routineSteps).values(stocked.map((row, index) => ({ routineId: routine.id, productId: row.id, stepNumber: index + 1, stepLabel: `${index + 1}-р алхам` })));
  return { ...routine, productIds: stocked.map(row => row.id) };
}
