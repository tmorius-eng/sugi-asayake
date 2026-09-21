// server/db/questions.ts — Асуулт, хариулт.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { isAdminPanelRole } from "../../shared/face-auth";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { productQuestions, productQuestionAnswers, products, users } from "../../drizzle/schema";
import { getDb } from "./connection";
import { findVerifyingOrderId } from "./customer-orders";

// ---------------------------------------------------------------------------
// Product Q&A (2026-09-13, migration 0071). Mirrors the review thread: one
// query for questions, one for answers, author avatar + staff flag inline so
// the storefront never needs a per-row lookup.
// ---------------------------------------------------------------------------

/** getProductReviews-тэй ижил хуудаслалт (2026-09-21); өмнө нь хатуу 50 байв. */
export async function getProductQuestions(productId: number, page: { limit?: number; cursor?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(page.limit ?? 20, 1), 50);
  const questions = await db
    .select({
      id: productQuestions.id,
      body: productQuestions.body,
      createdAt: productQuestions.createdAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorRole: users.role,
      authorUserId: users.id,
    })
    .from(productQuestions)
    .innerJoin(users, eq(users.id, productQuestions.userId))
    .where(and(eq(productQuestions.productId, productId), eq(productQuestions.isApproved, true), page.cursor ? lt(productQuestions.id, page.cursor) : undefined))
    .orderBy(desc(productQuestions.id))
    .limit(limit);
  if (questions.length === 0) return [];
  const ids = questions.map(q => q.id);
  const answerRows = await db
    .select({
      id: productQuestionAnswers.id,
      questionId: productQuestionAnswers.questionId,
      body: productQuestionAnswers.body,
      createdAt: productQuestionAnswers.createdAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorRole: users.role,
      authorUserId: users.id,
    })
    .from(productQuestionAnswers)
    .innerJoin(users, eq(users.id, productQuestionAnswers.userId))
    .where(and(inArray(productQuestionAnswers.questionId, ids), eq(productQuestionAnswers.isApproved, true)))
    .orderBy(productQuestionAnswers.createdAt);
  const byQuestion = new Map<number, typeof answerRows>();
  for (const row of answerRows) {
    const list = byQuestion.get(row.questionId) ?? [];
    list.push(row);
    byQuestion.set(row.questionId, list);
  }
  const shape = (row: { authorName: string | null; authorAvatarUrl: string | null; authorRole: string | null; authorUserId: number }) => ({
    authorName: row.authorName ?? "Хэрэглэгч",
    authorAvatarUrl: row.authorAvatarUrl,
    authorIsStaff: isAdminPanelRole(row.authorRole),
    authorUserId: row.authorUserId,
  });
  return questions.map(q => ({
    id: q.id,
    body: q.body,
    createdAt: q.createdAt,
    ...shape(q),
    answers: (byQuestion.get(q.id) ?? []).map(a => ({ id: a.id, body: a.body, createdAt: a.createdAt, ...shape(a) })),
  }));
}

/** Барааны хуудасны "Асуулт (N)" тоо — жагсаалт хуудаслагдсан тул тусад нь. */
export async function countProductQuestions(productId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(productQuestions)
    .where(and(eq(productQuestions.productId, productId), eq(productQuestions.isApproved, true)));
  return Number(row?.count ?? 0);
}

export async function createProductQuestion(input: { productId: number; userId: number; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, input.productId), eq(products.isPublished, true))).limit(1);
  if (!product) throw new Error("Бараа олдсонгүй.");
  const inserted = await db.insert(productQuestions).values({ productId: input.productId, userId: input.userId, body: input.body });
  const [created] = await db.select().from(productQuestions).where(eq(productQuestions.id, Number(inserted[0].insertId))).limit(1);
  return created;
}

/** Same rule as review replies: staff, or a customer who bought this product. The asker may not answer their own question. */
export async function canAnswerQuestion(userId: number, role: string | null, questionId: number): Promise<{ ok: true; productId: number } | { ok: false; reason: string }> {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Database is not available" };
  const [question] = await db.select({ id: productQuestions.id, productId: productQuestions.productId, userId: productQuestions.userId, isApproved: productQuestions.isApproved }).from(productQuestions).where(eq(productQuestions.id, questionId)).limit(1);
  if (!question || !question.isApproved) return { ok: false, reason: "Асуулт олдсонгүй." };
  if (isAdminPanelRole(role)) return { ok: true, productId: question.productId };
  if (await findVerifyingOrderId(userId, question.productId)) return { ok: true, productId: question.productId };
  return { ok: false, reason: "Зөвхөн ажилтан эсвэл энэ барааг захиалсан хэрэглэгч хариулах боломжтой." };
}

export async function createQuestionAnswer(input: { questionId: number; userId: number; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(productQuestionAnswers).values({ questionId: input.questionId, userId: input.userId, body: input.body });
  const [created] = await db.select().from(productQuestionAnswers).where(eq(productQuestionAnswers.id, Number(inserted[0].insertId))).limit(1);
  return created;
}

/** Admin moderation: newest first, with product name and answer count, hidden rows included. */
export async function getAdminQuestions(limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: productQuestions.id,
      productId: productQuestions.productId,
      productName: products.name,
      body: productQuestions.body,
      isApproved: productQuestions.isApproved,
      createdAt: productQuestions.createdAt,
      authorName: users.name,
      answerCount: sql<number>`(select count(*) from ${productQuestionAnswers} where ${productQuestionAnswers.questionId} = ${productQuestions.id})`,
    })
    .from(productQuestions)
    .innerJoin(products, eq(products.id, productQuestions.productId))
    .innerJoin(users, eq(users.id, productQuestions.userId))
    .orderBy(desc(productQuestions.createdAt))
    .limit(limit);
}

export async function setQuestionApproved(questionId: number, isApproved: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(productQuestions).set({ isApproved }).where(eq(productQuestions.id, questionId));
}

export async function deleteQuestion(questionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(productQuestions).where(eq(productQuestions.id, questionId));
}

export async function deleteQuestionAnswer(answerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(productQuestionAnswers).where(eq(productQuestionAnswers.id, answerId));
}
