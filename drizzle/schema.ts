import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  name: text("name"),
  /** Unique login identifier for the app's own email+password auth. */
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** scrypt("<saltHex>:<hashHex>") — see server/_core/password.ts. Never sent to the client. */
  passwordHash: varchar("passwordHash", { length: 200 }).notNull(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** Set the moment the user completes the email verification link. Null means unverified. */
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  /**
   * Bumped on password reset and on an explicit "sign out everywhere"
   * request. Embedded in every session JWT (see server/_core/context.ts) —
   * a token whose sessionVersion doesn't match the current value is treated
   * as invalid. This is the app's stand-in for real refresh-token rotation:
   * sessions are still long-lived JWTs, but they can now be revoked early.
   */
  sessionVersion: int("sessionVersion").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const productCategories = mysqlTable("product_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  description: text("description"),
  imageUrl: text("imageUrl"),
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  // RESTRICT: there is no admin "delete category" endpoint today, but if one
  // is ever added it shouldn't silently orphan/cascade-delete real products.
  categoryId: int("categoryId").notNull().references(() => productCategories.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  brand: varchar("brand", { length: 120 }),
  shortDescription: text("shortDescription"),
  description: text("description"),
  priceMnt: int("priceMnt").notNull(),
  compareAtPriceMnt: int("compareAtPriceMnt"),
  sku: varchar("sku", { length: 80 }).notNull().unique(),
  imageUrl: text("imageUrl"),
  galleryJson: text("galleryJson"),
  stockQuantity: int("stockQuantity").notNull().default(0),
  isPublished: boolean("isPublished").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("products_category_idx").on(table.categoryId),
  index("products_published_idx").on(table.isPublished),
]);

export const carts = mysqlTable("carts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["active", "converted", "abandoned"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("carts_user_idx").on(table.userId),
  index("carts_status_idx").on(table.status),
]);

export const cartItems = mysqlTable("cart_items", {
  id: int("id").autoincrement().primaryKey(),
  cartId: int("cartId").notNull().references(() => carts.id, { onDelete: "cascade" }),
  productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: int("quantity").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("cart_items_cart_idx").on(table.cartId),
  index("cart_items_product_idx").on(table.productId),
  uniqueIndex("cart_items_cart_product_unique").on(table.cartId, table.productId),
]);

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  // Nullable + SET NULL: orders are business/accounting records that must
  // outlive the account that placed them (also matches guest checkout, where
  // userId is already null).
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  orderNumber: varchar("orderNumber", { length: 32 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "confirmed", "packed", "out_for_delivery", "completed", "cancelled"]).notNull().default("pending"),
  paymentMethod: mysqlEnum("paymentMethod", ["qpay", "bank_transfer", "card", "cash_on_delivery"]).notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["unpaid", "paid", "refunded"]).notNull().default("unpaid"),
  deliveryMethod: mysqlEnum("deliveryMethod", ["ub_delivery", "store_pickup"]).notNull(),
  deliveryAddress: text("deliveryAddress"),
  pickupBranch: varchar("pickupBranch", { length: 120 }),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 40 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }),
  subtotalMnt: int("subtotalMnt").notNull(),
  deliveryFeeMnt: int("deliveryFeeMnt").notNull().default(0),
  totalMnt: int("totalMnt").notNull(),
  deliveryTrackingRef: varchar("deliveryTrackingRef", { length: 180 }),
  adminNote: text("adminNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("orders_user_idx").on(table.userId),
  index("orders_status_idx").on(table.status),
]);

export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id, { onDelete: "cascade" }),
  // Nullable + SET NULL: the row already denormalizes productName/sku/price,
  // so a later product deletion shouldn't erase order history.
  productId: int("productId").references(() => products.id, { onDelete: "set null" }),
  productName: varchar("productName", { length: 180 }).notNull(),
  sku: varchar("sku", { length: 80 }).notNull(),
  unitPriceMnt: int("unitPriceMnt").notNull(),
  quantity: int("quantity").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("order_items_order_idx").on(table.orderId),
]);

export const paymentAttempts = mysqlTable("payment_attempts", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id, { onDelete: "cascade" }),
  provider: mysqlEnum("provider", ["qpay"]).notNull(),
  providerInvoiceId: varchar("providerInvoiceId", { length: 128 }).notNull().unique(),
  providerPaymentId: varchar("providerPaymentId", { length: 128 }).unique(),
  status: mysqlEnum("status", ["created", "paid", "failed", "cancelled"]).notNull().default("created"),
  responseJson: text("responseJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("payment_attempts_order_idx").on(table.orderId),
  index("payment_attempts_status_idx").on(table.status),
]);

export const posts = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 220 }).notNull(),
  slug: varchar("slug", { length: 240 }).notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  coverImageUrl: text("coverImageUrl"),
  isPublished: boolean("isPublished").notNull().default(false),
  publishedAt: timestamp("publishedAt"),
  // RESTRICT: content should never silently disappear because its author's
  // account was removed — reassign/delete the posts first.
  createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("posts_published_idx").on(table.isPublished),
  index("posts_created_by_idx").on(table.createdByUserId),
]);

export const siteMedia = mysqlTable("site_media", {
  id: int("id").autoincrement().primaryKey(),
  slotKey: varchar("slotKey", { length: 80 }).notNull().unique(),
  imageUrl: text("imageUrl").notNull(),
  altText: varchar("altText", { length: 240 }),
  updatedByUserId: int("updatedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("site_media_updated_by_idx").on(table.updatedByUserId),
]);

export const adminAuditLogs = mysqlTable("admin_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  // RESTRICT: the audit trail must not be able to vanish just because the
  // actor's account was later deleted.
  actorUserId: int("actorUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: int("entityId"),
  metadataJson: text("metadataJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("admin_audit_actor_idx").on(table.actorUserId),
  index("admin_audit_entity_idx").on(table.entityType, table.entityId),
  index("admin_audit_created_idx").on(table.createdAt),
]);

export const staffInvitations = mysqlTable("staff_invitations", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["user", "admin"]).notNull().default("user"),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  invitedByUserId: int("invitedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  acceptedUserId: int("acceptedUserId").references(() => users.id, { onDelete: "set null" }),
  status: mysqlEnum("status", ["pending", "accepted", "revoked", "expired"]).notNull().default("pending"),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("staff_invites_email_idx").on(table.email),
  index("staff_invites_status_idx").on(table.status),
  index("staff_invites_expires_idx").on(table.expiresAt),
]);

/**
 * Single-use tokens for the "forgot password" flow. Only the sha256 hash of
 * the token is stored (same pattern as `staffInvitations.tokenHash`) so a
 * leaked database dump can't be used to reset accounts directly.
 */
export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("password_reset_tokens_user_idx").on(table.userId),
  index("password_reset_tokens_expires_idx").on(table.expiresAt),
]);

/** Single-use tokens for the (optional) "verify your email" flow. */
export const emailVerificationTokens = mysqlTable("email_verification_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("email_verification_tokens_user_idx").on(table.userId),
]);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

export type ProductCategory = typeof productCategories.$inferSelect;
export type InsertProductCategory = typeof productCategories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type Cart = typeof carts.$inferSelect;
export type InsertCart = typeof carts.$inferInsert;
export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = typeof cartItems.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;
export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type InsertPaymentAttempt = typeof paymentAttempts.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;
export type SiteMedia = typeof siteMedia.$inferSelect;
export type InsertSiteMedia = typeof siteMedia.$inferInsert;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type InsertAdminAuditLog = typeof adminAuditLogs.$inferInsert;
export type StaffInvitation = typeof staffInvitations.$inferSelect;
export type InsertStaffInvitation = typeof staffInvitations.$inferInsert;
