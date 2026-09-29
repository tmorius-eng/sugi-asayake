// server/db/routines-promotions.ts — Routine (арчилгааны багц) ба зарын урамшуулал.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { products, routines, routineSteps, sitePromotions } from "../../drizzle/schema";
import { withLiveCampaign } from "./price-campaigns";
import { getDb } from "./connection";

/**
 * PREMIUM-FEATURES.md TIER 4: does the given cart, as it stands right now,
 * contain every product in some published routine's steps? If several
 * qualify, the one worth the most to the shopper wins — there's no reason to
 * pick a smaller discount when a bigger one legitimately applies. Shared by
 * the checkout-preview query (cart.applicableRoutineDiscount) and the real
 * enforcement in createOrderFromActiveCart above, so the number a shopper
 * sees before confirming is guaranteed to be the number actually charged.
 */
export async function getApplicableRoutineDiscount(cartItems: { productId: number; priceMnt: number; quantity: number }[]) {
  const db = await getDb();
  if (!db || !cartItems.length) return null;

  const routineRows = await db.select({ id: routines.id, name: routines.name, discountPercent: routines.discountPercent })
    .from(routines)
    .where(and(eq(routines.isPublished, true), gte(routines.discountPercent, 1)));
  if (!routineRows.length) return null;

  // 2026-09-23: НИЙТЛЭГДСЭН барааны алхмууд л. Routine-ийн хуудас
  // (`loadRoutineWithSteps`) нийтлэгдээгүй алхмыг НУУДАГ атлаа хямдралын
  // шалгалт бүх алхмыг сагсанд байхыг шаарддаг байсан бөгөөд `addCartItem` нь
  // нийтлэгдээгүй барааг сагслуулдаггүй — өөрөөр хэлбэл 4 алхамт багцын нэг
  // бараа нийтлэлтээс хасагдвал хуудас 3 алхам + "хэмнэнэ" гэж үзүүлэх
  // атлаа хямдрал хэзээ ч хэрэгждэггүй байв.
  const stepRows = await db.select({ routineId: routineSteps.routineId, productId: routineSteps.productId })
    .from(routineSteps)
    .innerJoin(products, eq(products.id, routineSteps.productId))
    .where(and(inArray(routineSteps.routineId, routineRows.map(routine => routine.id)), eq(products.isPublished, true)));

  const cartProductIds = new Set(cartItems.map(item => item.productId));
  let best: { routineId: number; routineName: string; discountPercent: number; discountMnt: number } | null = null;

  for (const routine of routineRows) {
    const stepProductIds = stepRows.filter(step => step.routineId === routine.id).map(step => step.productId);
    if (!stepProductIds.length || !stepProductIds.every(productId => cartProductIds.has(productId))) continue;
    const routineSubtotal = cartItems.filter(item => stepProductIds.includes(item.productId)).reduce((sum, item) => sum + item.priceMnt * item.quantity, 0);
    const discountMnt = Math.round(routineSubtotal * routine.discountPercent / 100);
    if (discountMnt > 0 && (!best || discountMnt > best.discountMnt)) {
      best = { routineId: routine.id, routineName: routine.name, discountPercent: routine.discountPercent, discountMnt };
    }
  }
  return best;
}

async function loadRoutineWithSteps(routine: typeof routines.$inferSelect) {
  const db = await getDb();
  if (!db) return null;
  const steps = await db.select({
    id: routineSteps.id,
    stepNumber: routineSteps.stepNumber,
    stepLabel: routineSteps.stepLabel,
    productId: products.id,
    name: products.name,
    nameMn: products.nameMn,
    slug: products.slug,
    priceMnt: products.priceMnt,
    compareAtPriceMnt: products.compareAtPriceMnt,
    kind: products.kind,
    imageUrl: products.imageUrl,
    stockQuantity: products.stockQuantity,
    isPublished: products.isPublished,
  }).from(routineSteps).innerJoin(products, eq(products.id, routineSteps.productId)).where(eq(routineSteps.routineId, routine.id)).orderBy(asc(routineSteps.stepNumber));
  // 2026-09-29: нийтийн хямдрал — багцын хуудас сагстай ижил (хямдарсан) үнээр тооцно.
  return { ...routine, steps: await withLiveCampaign(steps.filter(step => step.isPublished)) };
}

export async function getPublishedRoutineBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(routines).where(and(eq(routines.slug, slug), eq(routines.isPublished, true))).limit(1);
  if (!rows[0]) return null;
  return loadRoutineWithSteps(rows[0]);
}

/** ProductDetail's "Routine-оо дуусга" cross-sell block: the first published
 *  routine (if any) this product is a step of, with all of its steps. */
export async function getRoutineForProduct(productId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ routine: routines }).from(routineSteps)
    .innerJoin(routines, eq(routines.id, routineSteps.routineId))
    .where(and(eq(routineSteps.productId, productId), eq(routines.isPublished, true)))
    // 2026-09-27 (D13): `.limit(1)`-тэй query ЗААВАЛ `ORDER BY` хэрэгтэй --
    // үгүй бол MySQL хамгийн бага зардалтай гэж үзсэн ямар ч мөрийг буцааж
    // болно, өөрөөр хэлбэл нэг бараа хуудас ачаалах бүрт өөр routine харуулах
    // эрсдэлтэй байв.
    .orderBy(asc(routines.id))
    .limit(1);
  if (!rows[0]) return null;
  return loadRoutineWithSteps(rows[0].routine);
}

export async function getAdminRoutines() {
  const db = await getDb();
  if (!db) return [];
  const routineRows = await db.select().from(routines).orderBy(desc(routines.updatedAt));
  const stepCounts = await db.select({ routineId: routineSteps.routineId, count: sql<number>`count(*)` }).from(routineSteps).groupBy(routineSteps.routineId);
  return routineRows.map(routine => ({ ...routine, stepCount: Number(stepCounts.find(row => row.routineId === routine.id)?.count ?? 0) }));
}

export async function getAdminRoutineDetail(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(routines).where(eq(routines.id, id)).limit(1);
  if (!rows[0]) return null;
  const steps = await db.select({
    id: routineSteps.id,
    stepNumber: routineSteps.stepNumber,
    stepLabel: routineSteps.stepLabel,
    productId: products.id,
    name: products.name,
    nameMn: products.nameMn,
    priceMnt: products.priceMnt,
    imageUrl: products.imageUrl,
  }).from(routineSteps).innerJoin(products, eq(products.id, routineSteps.productId)).where(eq(routineSteps.routineId, id)).orderBy(asc(routineSteps.stepNumber));
  return { ...rows[0], steps };
}

export type RoutineWriteInput = { name: string; slug: string; description?: string | null; discountPercent: number; isPublished: boolean };

export async function routineSlugExists(slug: string, excludeId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ id: routines.id }).from(routines).where(eq(routines.slug, slug)).limit(1);
  return Boolean(rows[0] && rows[0].id !== excludeId);
}

export async function createAdminRoutine(input: RoutineWriteInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(routines).values({ name: input.name, slug: input.slug, description: input.description ?? null, discountPercent: input.discountPercent, isPublished: input.isPublished });
  const created = await db.select().from(routines).where(eq(routines.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

export async function updateAdminRoutine(input: { id: number } & Partial<RoutineWriteInput>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const { id, ...changes } = input;
  const existing = await db.select({ id: routines.id }).from(routines).where(eq(routines.id, id)).limit(1);
  if (!existing[0]) throw new Error("Routine not found.");
  await db.update(routines).set({ ...changes, updatedAt: new Date() }).where(eq(routines.id, id));
  const updated = await db.select().from(routines).where(eq(routines.id, id)).limit(1);
  return updated[0];
}

export async function deleteAdminRoutine(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(routines).where(eq(routines.id, id));
  return { id };
}

/** The one promotion (if any) currently shown to shoppers: active, and
 *  inside its scheduled window if it has one. When several qualify (admin
 *  mistake, or a deliberate handoff between two promos), the most recently
 *  updated one wins — deterministic and matches "whatever I touched last is
 *  what's live" admin intuition. */
export async function getActiveSitePromotion() {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  // updatedAt has only whole-second precision, so two edits within the same
  // second would tie -- id DESC breaks that tie deterministically (the
  // more-recently-created/edited row is reliably the higher id in practice).
  const rows = await db.select().from(sitePromotions).where(eq(sitePromotions.isActive, true)).orderBy(desc(sitePromotions.updatedAt), desc(sitePromotions.id));
  const live = rows.find(row => (!row.startsAt || row.startsAt <= now) && (!row.endsAt || row.endsAt >= now));
  return live ?? null;
}

export async function getAdminSitePromotions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sitePromotions).orderBy(desc(sitePromotions.updatedAt));
}

export type SitePromotionWriteInput = {
  isActive: boolean;
  displayMode: "popup" | "banner";
  headline: string;
  message?: string | null;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

export async function createAdminSitePromotion(input: SitePromotionWriteInput, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(sitePromotions).values({ ...input, updatedByUserId });
  const created = await db.select().from(sitePromotions).where(eq(sitePromotions.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

export async function updateAdminSitePromotion(input: { id: number } & Partial<SitePromotionWriteInput>, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const { id, ...changes } = input;
  const existing = await db.select({ id: sitePromotions.id }).from(sitePromotions).where(eq(sitePromotions.id, id)).limit(1);
  if (!existing[0]) throw new Error("Promotion not found.");
  await db.update(sitePromotions).set({ ...changes, updatedByUserId, updatedAt: new Date() }).where(eq(sitePromotions.id, id));
  const updated = await db.select().from(sitePromotions).where(eq(sitePromotions.id, id)).limit(1);
  return updated[0];
}

export async function deleteAdminSitePromotion(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(sitePromotions).where(eq(sitePromotions.id, id));
  return { id };
}

/** Admin submits the whole ordered step list each time — simpler and less
 *  error-prone than incremental add/remove/reorder endpoints for a list
 *  that's realistically a handful of steps. Replaces all of a routine's
 *  steps in one transaction. */
export async function setRoutineSteps(routineId: number, steps: { productId: number; stepLabel: string }[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (steps.length === 0) throw new Error("Routine-д хамгийн багадаа нэг алхам байх ёстой.");
  if (new Set(steps.map(step => step.productId)).size !== steps.length) throw new Error("Нэг бүтээгдэхүүн routine-д хоёр удаа орж болохгүй.");

  await db.transaction(async tx => {
    await tx.delete(routineSteps).where(eq(routineSteps.routineId, routineId));
    await tx.insert(routineSteps).values(steps.map((step, index) => ({ routineId, productId: step.productId, stepNumber: index + 1, stepLabel: step.stepLabel })));
  });
  return getAdminRoutineDetail(routineId);
}
