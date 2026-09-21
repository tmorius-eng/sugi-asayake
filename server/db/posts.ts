// server/db/posts.ts — Нийтлэл, ангилал/tag, медиа сан.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, asc, desc, eq, inArray, isNull, like, lte, sql } from "drizzle-orm";
import { mediaLibrary, postCategories, postCategoryLinks, posts, postTagLinks, postTags } from "../../drizzle/schema";
import { slugify } from "../../shared/slugify";
import { getOrSetCached } from "../_core/ttlCache";
import { sanitizePostContent } from "../_core/sanitizeHtml";
import { getDb } from "./connection";
import { STOREFRONT_CACHE_KEYS, STOREFRONT_CACHE_TTL_MS, invalidateStorefront } from "./site";

// 2026-09-07 (WordPress-parity admin editor rebuild): categoryIds/tagNames
// resolve into post_category_links/post_tag_links (see attachPostTaxonomy
// below); publishAt lets an admin schedule a future publish date instead of
// always auto-stamping "now" the moment isPublished flips true (see
// getPublishedPosts/getPublishedPostBySlug's `publishedAt <= NOW()` gate --
// this is the entire scheduling mechanism, no cron/job queue involved).
export type PostWriteInput = {
  title: string;
  slug: string;
  excerpt?: string | null;
  content: string;
  coverImageUrl?: string | null;
  isPublished: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  format?: string;
  categoryIds?: number[];
  tagNames?: string[];
  publishAt?: Date | null;
};

type PostTaxonomy = { categories: { id: number; name: string; slug: string }[]; tags: { id: number; name: string; slug: string }[] };
const emptyTaxonomy: PostTaxonomy = { categories: [], tags: [] };

/**
 * Batch-loads categories/tags for a set of posts in 2 extra queries total
 * (not N+1) -- fine at this blog's scale, and avoids the duplicate-row
 * fan-out a single multi-join query would produce for posts with >1
 * category/tag.
 */
async function getPostTaxonomyMap(postIds: number[]): Promise<Map<number, PostTaxonomy>> {
  const map = new Map<number, PostTaxonomy>();
  if (postIds.length === 0) return map;
  const db = await getDb();
  if (!db) return map;
  const [categoryRows, tagRows] = await Promise.all([
    db.select({ postId: postCategoryLinks.postId, id: postCategories.id, name: postCategories.name, slug: postCategories.slug })
      .from(postCategoryLinks).innerJoin(postCategories, eq(postCategoryLinks.categoryId, postCategories.id))
      .where(inArray(postCategoryLinks.postId, postIds)),
    db.select({ postId: postTagLinks.postId, id: postTags.id, name: postTags.name, slug: postTags.slug })
      .from(postTagLinks).innerJoin(postTags, eq(postTagLinks.tagId, postTags.id))
      .where(inArray(postTagLinks.postId, postIds)),
  ]);
  for (const row of categoryRows) {
    const entry = map.get(row.postId) ?? { categories: [], tags: [] };
    entry.categories.push({ id: row.id, name: row.name, slug: row.slug });
    map.set(row.postId, entry);
  }
  for (const row of tagRows) {
    const entry = map.get(row.postId) ?? { categories: [], tags: [] };
    entry.tags.push({ id: row.id, name: row.name, slug: row.slug });
    map.set(row.postId, entry);
  }
  return map;
}

/** Replaces (not merges) a post's category/tag links -- undefined means "leave as-is" (used by partial updates). */
async function attachPostTaxonomy(postId: number, categoryIds: number[] | undefined, tagNames: string[] | undefined) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (categoryIds !== undefined) {
    await db.delete(postCategoryLinks).where(eq(postCategoryLinks.postId, postId));
    if (categoryIds.length > 0) await db.insert(postCategoryLinks).values(categoryIds.map(categoryId => ({ postId, categoryId })));
  }
  if (tagNames !== undefined) {
    const tagIds = await resolveTagIdsByName(tagNames);
    await db.delete(postTagLinks).where(eq(postTagLinks.postId, postId));
    if (tagIds.length > 0) await db.insert(postTagLinks).values(tagIds.map(tagId => ({ postId, tagId })));
  }
}

/** Tags are created on the fly by name (matches WordPress's tag input) -- categories are not, they're picked from an admin-managed list. */
async function resolveTagIdsByName(names: string[]): Promise<number[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const uniqueNames = Array.from(new Set(names.map(name => name.trim()).filter(Boolean)));
  if (uniqueNames.length === 0) return [];
  const existing = await db.select().from(postTags).where(inArray(postTags.name, uniqueNames));
  const existingByName = new Map(existing.map(tag => [tag.name, tag]));
  const ids: number[] = [];
  for (const name of uniqueNames) {
    const found = existingByName.get(name);
    if (found) { ids.push(found.id); continue; }
    const slug = slugify(name) || `tag-${Date.now()}`;
    const inserted = await db.insert(postTags).values({ name, slug });
    ids.push(Number(inserted[0].insertId));
  }
  return ids;
}

export async function getPublishedPosts() {
  return getOrSetCached(STOREFRONT_CACHE_KEYS.posts, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({ id: posts.id, title: posts.title, slug: posts.slug, excerpt: posts.excerpt, coverImageUrl: posts.coverImageUrl, publishedAt: posts.publishedAt })
      .from(posts)
      // 2026-09-07: added `publishedAt <= NOW()` -- a post with isPublished
      // true but a future publishedAt (an admin-scheduled post) must stay
      // invisible here until that moment actually passes. No cron/worker
      // needed: this WHERE clause re-evaluates on every normal page-load
      // query, so a scheduled post simply starts appearing the next time
      // anyone loads a page after its publish time.
      .where(and(eq(posts.isPublished, true), isNull(posts.deletedAt), lte(posts.publishedAt, new Date())))
      .orderBy(desc(posts.publishedAt));
    const taxonomy = await getPostTaxonomyMap(rows.map(row => row.id));
    return rows.map(row => ({ ...row, ...(taxonomy.get(row.id) ?? emptyTaxonomy) }));
  });
}

/** /journal хуудаслалт (2026-09-21): жагсаалт бүхэлдээ 30 с кэштэй (дээрх) тул хуудсыг
 *  санах ойд зүснэ — DB-д нэмэлт query байхгүй, `total` үнэн. */
export async function getPublishedPostsPage(page: { page?: number; pageSize?: number } = {}) {
  const all = await getPublishedPosts();
  const pageSize = Math.min(Math.max(page.pageSize ?? 12, 1), 48);
  const pageCount = Math.max(1, Math.ceil(all.length / pageSize));
  const current = Math.min(Math.max(page.page ?? 1, 1), pageCount);
  return { items: all.slice((current - 1) * pageSize, current * pageSize), total: all.length, page: current, pageSize, pageCount };
}

/**
 * `bypassGate`: used by content.bySlug when the requester is a signed-in
 * staff/admin, so "Preview" (see AdminPostsPanel.tsx) can open a real,
 * unpublished or not-yet-scheduled post's actual public URL. A trashed post
 * is never previewable this way -- deletedAt IS NULL always applies.
 */
export async function getPublishedPostBySlug(slug: string, options: { bypassGate?: boolean } = {}) {
  const db = await getDb();
  // 2026-09-07 (real, pre-existing bug found live via Playwright while
  // testing the new Preview/Trash flow -- not something this WordPress-
  // parity change introduced, but hit directly by it and fixed while here):
  // returning `undefined` for "no post found" made react-query itself throw
  // "Query data cannot be undefined" in the browser console on every single
  // not-found post slug, including the ordinary 404 case PostDetail.tsx
  // already handles via `!post`. `null` means exactly the same thing to
  // that check and is what react-query actually requires a query fn return.
  if (!db) return null;
  const conditions = [eq(posts.slug, slug), isNull(posts.deletedAt)];
  if (!options.bypassGate) conditions.push(eq(posts.isPublished, true), lte(posts.publishedAt, new Date()));
  const rows = await db.select().from(posts).where(and(...conditions)).limit(1);
  if (!rows[0]) return null;
  const taxonomy = (await getPostTaxonomyMap([rows[0].id])).get(rows[0].id) ?? emptyTaxonomy;
  return { ...rows[0], ...taxonomy };
}

/** Admin list -- every post regardless of published/draft/scheduled/trash status; the panel itself filters by tab. */
export async function getAdminPosts() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(posts).orderBy(desc(posts.updatedAt));
  const taxonomy = await getPostTaxonomyMap(rows.map(row => row.id));
  return rows.map(row => ({ ...row, ...(taxonomy.get(row.id) ?? emptyTaxonomy) }));
}

export async function postSlugExists(slug: string, excludeId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ id: posts.id }).from(posts).where(eq(posts.slug, slug)).limit(1);
  return Boolean(rows[0] && rows[0].id !== excludeId);
}

export async function createAdminPost(input: PostWriteInput & { createdByUserId: number }) {
  invalidateStorefront("posts");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const { categoryIds, tagNames, publishAt, ...postFields } = input;
  const inserted = await db.insert(posts).values({
    ...postFields,
    content: sanitizePostContent(input.content),
    excerpt: input.excerpt ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
    format: input.format ?? "standard",
    publishedAt: input.isPublished ? (publishAt ?? new Date()) : null,
  });
  const postId = Number(inserted[0].insertId);
  await attachPostTaxonomy(postId, categoryIds, tagNames);
  const created = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  return { ...created[0], ...((await getPostTaxonomyMap([postId])).get(postId) ?? emptyTaxonomy) };
}

export async function updateAdminPost(input: { id: number } & Partial<PostWriteInput>) {
  invalidateStorefront("posts");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(posts).where(eq(posts.id, input.id)).limit(1);
  if (!existing[0]) throw new Error("Пост олдсонгүй.");
  const { id, categoryIds, tagNames, publishAt, content, ...changes } = input;
  const willBePublished = input.isPublished ?? existing[0].isPublished;
  // An explicit publishAt always wins (admin is actively scheduling/
  // rescheduling); otherwise preserve the original "stamp now, once, on the
  // false->true transition" behavior so re-saving an already-published post
  // never resets its publish date.
  const nextPublishedAt = !willBePublished ? null
    : publishAt !== undefined ? publishAt
    : (input.isPublished === true && !existing[0].isPublished) ? new Date()
    : existing[0].publishedAt;
  await db.update(posts).set({
    ...changes,
    ...(content !== undefined ? { content: sanitizePostContent(content) } : {}),
    publishedAt: nextPublishedAt,
    updatedAt: new Date(),
  }).where(eq(posts.id, id));
  await attachPostTaxonomy(id, categoryIds, tagNames);
  const updated = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return { ...updated[0], ...((await getPostTaxonomyMap([id])).get(id) ?? emptyTaxonomy) };
}

/** Soft-delete (WordPress "Move to Trash") -- restorable via restoreAdminPost, not visible in getPublishedPosts/getAdminPosts's public-facing queries. */
export async function trashAdminPost(id: number) {
  invalidateStorefront("posts");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, id));
  return { id };
}

export async function restoreAdminPost(id: number) {
  invalidateStorefront("posts");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(posts).set({ deletedAt: null }).where(eq(posts.id, id));
  return { id };
}

/** WordPress's "Delete Permanently" -- only allowed on a post already in Trash, matching WP's own 2-step flow (no one-click permanent delete from the main list). */
export async function permanentlyDeleteAdminPost(id: number) {
  invalidateStorefront("posts");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select({ deletedAt: posts.deletedAt }).from(posts).where(eq(posts.id, id)).limit(1);
  if (!existing[0]) throw new Error("Пост олдсонгүй.");
  if (!existing[0].deletedAt) throw new Error("Эхлээд постыг хогийн санд шилжүүлнэ үү.");
  await db.delete(posts).where(eq(posts.id, id));
  return { id };
}

// --- Post categories (WordPress-parity taxonomy; flat, no parent/child nesting) ---

export async function getAdminPostCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(postCategories).orderBy(asc(postCategories.name));
}

export async function postCategoryNameExists(name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ id: postCategories.id }).from(postCategories).where(eq(postCategories.name, name)).limit(1);
  return Boolean(rows[0]);
}

/**
 * Нийтлэлийн ангилал устгах (2026-09-16, Tom: "устгах юу ч алга").
 *
 * `post_category_links` нь `onDelete: "cascade"` тул MySQL холбоосыг өөрөө
 * арилгана — гэхдээ тэр нь ЧИМЭЭГҮЙ болно: админ 12 нийтлэлтэй ангиллыг
 * устгаад тэдгээр нийтлэл ангилалгүй үлдсэнийг мэдэхгүй. Тиймээс холбоос
 * байвал татгалзаж, хэдэн нийтлэл байгааг хэлнэ.
 */
export async function deleteAdminPostCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [category] = await db.select().from(postCategories).where(eq(postCategories.id, id)).limit(1);
  if (!category) throw new Error("Ангилал олдсонгүй.");
  const links = await db.select({ postId: postCategoryLinks.postId }).from(postCategoryLinks).where(eq(postCategoryLinks.categoryId, id));
  if (links.length > 0) {
    throw new Error(`Энэ ангилалд ${links.length} нийтлэл хамаарч байна. Эхлээд тэдгээрээс ангиллыг нь салгана уу.`);
  }
  await db.delete(postCategories).where(eq(postCategories.id, id));
  return { id, name: category.name };
}

export async function createAdminPostCategory(name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const slug = slugify(name) || `category-${Date.now()}`;
  const inserted = await db.insert(postCategories).values({ name, slug });
  const created = await db.select().from(postCategories).where(eq(postCategories.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}

// --- Media library (backs the new post editor's "Add Media" modal) ---

export async function getAdminMediaLibrary(options: { search?: string; page?: number; pageSize?: number } = {}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const pageSize = Math.min(Math.max(options.pageSize ?? 24, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const whereClause = options.search ? like(mediaLibrary.fileName, `%${options.search}%`) : undefined;
  const [items, countRows] = await Promise.all([
    db.select().from(mediaLibrary).where(whereClause).orderBy(desc(mediaLibrary.createdAt), desc(mediaLibrary.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(mediaLibrary).where(whereClause),
  ]);
  return { items, total: Number(countRows[0]?.count ?? 0) };
}

export async function insertMediaLibraryItem(input: { key: string; url: string; fileName: string; contentType: string; sizeBytes: number; uploadedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(mediaLibrary).values(input);
  const created = await db.select().from(mediaLibrary).where(eq(mediaLibrary.id, Number(inserted[0].insertId))).limit(1);
  return created[0];
}
