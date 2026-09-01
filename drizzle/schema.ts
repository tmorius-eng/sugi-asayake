import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { ubDistricts } from "../shared/districts";

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
  /** Customer profile page (TIER: account). Free-form; also duplicated onto
   *  each saved address since a delivery contact number can differ from the
   *  account owner's own number. */
  phone: varchar("phone", { length: 40 }),
  /** Public S3/MinIO URL of the uploaded profile photo. Null = no avatar
   *  (the UI falls back to an initial-letter badge). */
  avatarUrl: varchar("avatarUrl", { length: 500 }),
  /**
   * Beauty & Home preference profile (customer account page). Stored for a
   * future product-tag-matched recommendation engine — the catalog doesn't
   * carry matching skin/interior tags yet (see ROADMAP.md TIER 2), so these
   * are captured now but not yet used to filter or rank anything shown to
   * the shopper.
   */
  skinType: mysqlEnum("skinType", ["dry", "oily", "combination", "sensitive", "normal"]),
  /** Free-form comma-separated concern keys (e.g. "acne,aging,dullness") —
   *  a plain list column rather than a join table since concerns are only
   *  ever read/written as a whole set for one profile, never queried by
   *  individual concern. */
  skinConcerns: varchar("skinConcerns", { length: 300 }),
  interiorStyle: varchar("interiorStyle", { length: 60 }),
  /**
   * Preference Profile v2 (2026-09-01): same "optional, never asked at
   * signup, N of M reporting only" discipline as birthYear/occupation below
   * — collected via the profile-page quiz wizard, never mandatory.
   * hairType/hairConcerns/fragrancePreference/wellnessInterests mirror the
   * matching columns on `products` (see the doc-comment there) so
   * getRecommendedProducts stays a plain intersection, no new tagging
   * vocabulary to keep in sync. skinRoutineComplexity has NO product
   * mirror — it's informational only (shown back to the shopper, not fed
   * into recommendation scoring). hasYoungChildren also has no product
   * mirror — it's matched directly against the "Ээж ба хүүхэд" category at
   * query time instead of tagging 35 individual products.
   */
  gender: mysqlEnum("gender", ["male", "female", "other"]),
  primaryDistrict: mysqlEnum("primaryDistrict", ubDistricts),
  skinRoutineComplexity: mysqlEnum("skinRoutineComplexity", ["minimal", "moderate", "extensive"]),
  hairType: mysqlEnum("hairType", ["dry", "oily", "normal", "damaged", "color_treated"]),
  hairConcerns: varchar("hairConcerns", { length: 300 }),
  fragrancePreference: mysqlEnum("fragrancePreference", ["unscented", "light", "floral", "citrus"]),
  wellnessInterests: varchar("wellnessInterests", { length: 300 }),
  hasYoungChildren: boolean("hasYoungChildren"),
  /**
   * Admin customer-analytics profile (optional, never asked at signup —
   * conversion cost of a mandatory field isn't worth it). Offered as an
   * optional "help us personalize your experience" prompt on the profile
   * page; only ever known from the moment a shopper chooses to fill it in,
   * so any age/occupation breakdown in the admin analytics panel must
   * report against "N of M shoppers told us", never pretend to cover
   * everyone — see getCustomerDemographics in server/analytics.ts.
   * birthYear (not full DOB) is the least invasive way to bucket by age.
   */
  birthYear: int("birthYear"),
  occupation: varchar("occupation", { length: 120 }),
  /** Notification preferences (customer account page, "Мэдэгдэл" tab).
   *  NOTE: order-confirmation / delivery-status emails don't exist yet
   *  (ROADMAP.md TIER 2 — "Захиалгын баталгаажуулах имэйл ... дуудалт хийгээгүй"),
   *  so these flags are captured and enforced only for the notifications
   *  this app already sends (currently: back-in-stock wishlist alerts) —
   *  not a blanket promise every future email/SMS respects them yet. */
  emailOptIn: boolean("emailOptIn").notNull().default(true),
  smsOptIn: boolean("smsOptIn").notNull().default(true),
  /** Unique login identifier for the app's own email+password auth. */
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** scrypt("<saltHex>:<hashHex>") — see server/_core/password.ts. Never sent to the client. */
  passwordHash: varchar("passwordHash", { length: 200 }).notNull(),
  // "staff" (TIER 3): can manage products/categories/orders/posts/media but
  // not user accounts, roles, or financial figures — see staffProcedure in
  // server/_core/trpc.ts for the enforcement.
  role: mysqlEnum("role", ["user", "staff", "admin"]).default("user").notNull(),
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
  /**
   * Set by an admin to lock the account out (TIER 2 admin panel). Checked on
   * every request in server/_core/context.ts, so it takes effect immediately
   * for already-issued sessions too — not just at the next login.
   */
  suspendedAt: timestamp("suspendedAt"),
  suspendedReason: varchar("suspendedReason", { length: 300 }),
  /**
   * PREMIUM-FEATURES.md TIER 5: Loyalty & Retention, matching the real
   * cumulative-lifetime-spend tier discount Tom's 3 physical branches
   * already run on Smart POS (500k -> 3%, 1M -> 5%, 10M -> 10%). This app
   * only sees online orders, so in-store history has no automatic path in
   * — no API integration with Smart POS exists (Tom's explicit call,
   * 2026-08-25: build native-only for now). This column is a manually
   * admin-entered credit (e.g. "this customer has 800,000₮ of known
   * in-store history") that's added on top of their tracked online spend
   * when computing their tier — see getUserLoyaltyStatus in server/db.ts.
   */
  loyaltyManualAdjustmentMnt: int("loyaltyManualAdjustmentMnt").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Customer profile address book (TIER: account). Lets a returning shopper
 * save multiple delivery addresses ("Гэр", "Ажил", ...) instead of retyping
 * one every checkout — the standard "world-class" ecommerce account pattern.
 * Exactly one row per user has isDefault = true; enforced in server/db.ts
 * (createUserAddress/updateUserAddress/deleteUserAddress), not the DB, since
 * MySQL has no partial-unique-index equivalent here.
 */
export const userAddresses = mysqlTable("user_addresses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 60 }).notNull(),
  recipientName: varchar("recipientName", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  addressLine: text("addressLine").notNull(),
  /** Optional structured Улаанбаатар дүүрэг pick — see shared/districts.ts.
   *  addressLine stays the free-text field couriers actually read; this is
   *  purely so admin analytics can report real district breakdowns instead
   *  of guessing from text. Null for addresses saved before this existed
   *  or outside UB. */
  district: mysqlEnum("district", ubDistricts),
  isDefault: boolean("isDefault").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("user_addresses_user_idx").on(table.userId),
]);

export type UserAddress = typeof userAddresses.$inferSelect;
export type InsertUserAddress = typeof userAddresses.$inferInsert;

/**
 * Customer wishlist / saved items (TIER: account). One row per
 * user+product ("boards"/named collections are a possible fast-follow —
 * this is a single flat list per user for now, which is still the core of
 * what every reference site's "Saved Items" does). `notifyOnRestock` powers
 * the "Ирэхээр мэдэгдэх" back-in-stock email — see notifyWishlistWatchers
 * in server/db.ts, triggered from admin.updateProduct when stock goes from
 * 0 to >0.
 */
export const wishlistItems = mysqlTable("wishlist_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
  notifyOnRestock: boolean("notifyOnRestock").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("wishlist_items_user_product_idx").on(table.userId, table.productId),
  index("wishlist_items_product_idx").on(table.productId),
]);

export type WishlistItem = typeof wishlistItems.$inferSelect;
export type InsertWishlistItem = typeof wishlistItems.$inferInsert;

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

/**
 * `products` also carries a FULLTEXT index over (name, brand,
 * shortDescription) — `products_search_idx`, added by
 * drizzle/0027_catalog_fulltext_search.sql — powering server-side catalog
 * search (server/db.ts searchPublishedCatalog). It's applied via raw SQL,
 * not declared here: this drizzle-orm version's mysql-core `index()`
 * builder has no FULLTEXT index type.
 */
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
  /** Cost price (admin-entered, optional) — the one new input that makes
   *  real profit/margin reporting possible (see getProfitOverview in
   *  server/analytics.ts). Null until an admin fills it in; profit
   *  reporting only ever covers products that have one, and always says
   *  so ("N/M барааны cost мэдээлэлтэй") rather than presenting a partial
   *  sample as the whole picture — same discipline as the demographics
   *  section of the analytics dashboard. */
  costMnt: int("costMnt"),
  sku: varchar("sku", { length: 80 }).notNull().unique(),
  imageUrl: text("imageUrl"),
  galleryJson: text("galleryJson"),
  stockQuantity: int("stockQuantity").notNull().default(0),
  isPublished: boolean("isPublished").notNull().default(false),
  /**
   * PREMIUM-FEATURES.md TIER 1: matches the same three fields on `users`
   * (see the Beauty & Home preference profile there) so "recommended for
   * you" can just intersect a shopper's saved preferences against these —
   * no separate tagging vocabulary to keep in sync. All nullable: a given
   * product only fills in whichever of skinType/skinConcerns (skincare) or
   * interiorStyle (home goods) actually applies to it.
   */
  skinType: mysqlEnum("skinType", ["dry", "oily", "combination", "sensitive", "normal"]),
  skinConcerns: varchar("skinConcerns", { length: 300 }),
  interiorStyle: varchar("interiorStyle", { length: 60 }),
  /**
   * Preference Profile v2 (2026-09-01): mirrors the matching new columns on
   * `users` (see the doc-comment there) — hairType/hairConcerns cover the
   * "Үс ба бие" category, fragrancePreference is a cross-cutting soft
   * signal, wellnessInterests covers "Эрүүл мэнд". All nullable, populated
   * either by an admin (AdminWorkspace.tsx "PERSONALIZATION TAGS") or by
   * the one-off scripts/auto-tag-products.ts keyword pass — see that
   * script for why product `name` is the primary matching signal (most of
   * the real catalog's shortDescription text is too generic to use).
   */
  hairType: mysqlEnum("hairType", ["dry", "oily", "normal", "damaged", "color_treated"]),
  hairConcerns: varchar("hairConcerns", { length: 300 }),
  fragrancePreference: mysqlEnum("fragrancePreference", ["unscented", "light", "floral", "citrus"]),
  wellnessInterests: varchar("wellnessInterests", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("products_category_idx").on(table.categoryId),
  index("products_published_idx").on(table.isPublished),
]);

/**
 * Product variants (PHASE 1 — additive, zero behavior change to the live
 * storefront). Tom's real POS-imported catalog already models size/color
 * options as fully separate `products` rows (their own barcode/SKU), so
 * introducing a *relational* variant layer on top of 937 live products with
 * real cart/order/review/loyalty history is a genuinely risky migration —
 * done deliberately in phases rather than one big-bang cutover:
 *
 * Phase 1 (done, see the 0030 migration): every existing product got exactly
 * one auto-created variant (its own sku/price/stock, isDefault=true) via a
 * one-time backfill. Admin-only at that point: nothing in cart/checkout/
 * orders read this table yet.
 *
 * Phase 2 (done, see the 0031 migration): cart_items/order_items now key off
 * variantId (see cartItems/orderItems below) — a shopper can choose and buy
 * a non-default variant, and stock/price/sku for the purchase path always
 * resolve through this table, for every product, single- or multi-variant
 * alike. `products.priceMnt`/`stockQuantity`/`sku` stay meaningful too: for
 * the common case of a product with exactly one variant, `admin.updateProduct`
 * keeps that sole variant mirrored automatically (see
 * syncSoleVariantFromProduct in server/db.ts), so editing a simple product is
 * still just one set of fields. `wishlist_items`/`product_reviews`
 * deliberately stay product-level (saving/reviewing "the product," not one
 * SKU — see their own schema comments); low-stock display, CSV bulk export,
 * and the back-in-stock wishlist hook still read products.stockQuantity,
 * which is an approximation for genuinely multi-variant products (a known,
 * documented scope limit, not an oversight).
 */
export const productVariants = mysqlTable("product_variants", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
  sku: varchar("sku", { length: 80 }).notNull().unique(),
  // Free-form key-value pairs (e.g. {"Хэмжээ": "400мл"} or {"Өнгө": "Хар",
  // "Хэмжээ": "M"}) rather than fixed color/size columns — different
  // product families (skincare vs. interior goods) use different
  // attribute vocabularies, and a fixed column set would fit neither well.
  attributesJson: text("attributesJson"),
  priceMnt: int("priceMnt").notNull(),
  compareAtPriceMnt: int("compareAtPriceMnt"),
  stockQuantity: int("stockQuantity").notNull().default(0),
  imageUrl: text("imageUrl"),
  isDefault: boolean("isDefault").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("product_variants_product_idx").on(table.productId),
]);
export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = typeof productVariants.$inferInsert;

export const carts = mysqlTable("carts", {
  id: int("id").autoincrement().primaryKey(),
  // Exactly one of userId / guestToken is set. Nullable (guest checkout):
  // an anonymous shopper's cart is identified by an opaque cookie token
  // instead of an account. See server/db.ts's CartOwner type.
  userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
  guestToken: varchar("guestToken", { length: 64 }),
  status: mysqlEnum("status", ["active", "converted", "abandoned"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("carts_user_idx").on(table.userId),
  index("carts_guest_token_idx").on(table.guestToken),
  index("carts_status_idx").on(table.status),
]);

/**
 * PHASE 2 of product variants (see the long comment on productVariants
 * above): a cart line is keyed by variantId, not productId -- that's what
 * lets two different variants of the same product (e.g. 170ml and 400ml)
 * sit in the same cart as separate lines. The product itself is reached by
 * joining through productVariants.productId (see getActiveCartForOwner in
 * server/db.ts); there's no separate productId column here to keep in sync.
 */
export const cartItems = mysqlTable("cart_items", {
  id: int("id").autoincrement().primaryKey(),
  cartId: int("cartId").notNull().references(() => carts.id, { onDelete: "cascade" }),
  variantId: int("variantId").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
  quantity: int("quantity").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("cart_items_cart_idx").on(table.cartId),
  uniqueIndex("cart_items_cart_variant_unique").on(table.cartId, table.variantId),
]);

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  // Nullable + SET NULL: orders are business/accounting records that must
  // outlive the account that placed them (also matches guest checkout, where
  // userId is already null).
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  orderNumber: varchar("orderNumber", { length: 32 }).notNull().unique(),
  // "returned" is only ever reachable from "completed" (see updateAdminOrder
  // in server/db.ts's transition guard) -- an order that was delivered and
  // later came back. Never restores stock automatically (the returned
  // item's resellable condition is unknown) and never touches paymentStatus
  // (a refund/credit flow is separate, unscoped work) -- see the schema
  // comment on returnedAt and getReturnRateOverview in server/analytics.ts.
  status: mysqlEnum("status", ["pending", "confirmed", "packed", "out_for_delivery", "completed", "cancelled", "returned"]).notNull().default("pending"),
  paymentMethod: mysqlEnum("paymentMethod", ["qpay", "bank_transfer", "card", "cash_on_delivery"]).notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["unpaid", "paid", "refunded"]).notNull().default("unpaid"),
  deliveryMethod: mysqlEnum("deliveryMethod", ["ub_delivery", "store_pickup"]).notNull(),
  deliveryAddress: text("deliveryAddress"),
  /** Snapshotted at order time from the chosen address's district (same
   *  denormalization discipline as customerName/customerPhone below — a
   *  later address edit/deletion must never change historical order
   *  reporting). Null for store_pickup orders and for ub_delivery orders
   *  placed before this field existed (best-effort backfilled from
   *  deliveryAddress text via guessDistrictFromAddress where it could be —
   *  see scripts/backfill-order-districts.ts, run once). See
   *  shared/districts.ts and server/analytics.ts's district breakdown. */
  deliveryDistrict: mysqlEnum("deliveryDistrict", ubDistricts),
  pickupBranch: varchar("pickupBranch", { length: 120 }),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 40 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }),
  subtotalMnt: int("subtotalMnt").notNull(),
  deliveryFeeMnt: int("deliveryFeeMnt").notNull().default(0),
  /**
   * PREMIUM-FEATURES.md TIER 4: automatically applied when the cart, at the
   * moment of order placement, still contains every product in a published
   * routine's steps — see getApplicableRoutineDiscount in server/db.ts. Not a
   * coupon code or a client-supplied amount: computed server-side from real
   * cart contents so the "Бүгдийг сагслах" savings claim on the routine page
   * is always literally true at checkout, never just a decorative label.
   */
  discountMnt: int("discountMnt").notNull().default(0),
  // Nullable + SET NULL: which routine (if any) earned the discount above,
  // kept purely for admin/order-history visibility — a routine being edited
  // or unpublished later shouldn't retroactively break old order records.
  appliedRoutineId: int("appliedRoutineId").references(() => routines.id, { onDelete: "set null" }),
  /**
   * PREMIUM-FEATURES.md TIER 5: applied on top of the routine discount
   * above, computed from the shopper's real cumulative paid spend at order
   * time (see getUserLoyaltyStatus/getApplicableLoyaltyDiscount) — same
   * "actually enforced, not a label" discipline as the routine discount.
   * appliedLoyaltyTierName is a plain text snapshot (tiers are a hardcoded
   * constant, not a DB table) purely for order-history/admin display.
   */
  loyaltyDiscountMnt: int("loyaltyDiscountMnt").notNull().default(0),
  appliedLoyaltyTierName: varchar("appliedLoyaltyTierName", { length: 40 }),
  /**
   * Manually-entered coupon ("SALE10"), computed on (subtotal - routine
   * discount) and itself subtracted before the loyalty tier discount is
   * computed — see the stacking order comment in createOrderFromActiveCart.
   * couponCode is a plain text snapshot (not a FK) so a later-deleted or
   * edited discount_codes row never breaks/changes historical order display.
   */
  couponCode: varchar("couponCode", { length: 40 }),
  couponDiscountMnt: int("couponDiscountMnt").notNull().default(0),
  totalMnt: int("totalMnt").notNull(),
  deliveryTrackingRef: varchar("deliveryTrackingRef", { length: 180 }),
  // Set exactly once, the moment an admin marks a completed order
  // "returned" (server/db.ts's updateAdminOrder) -- never touched any other
  // way. getReturnRateOverview windows its two different figures by two
  // different fields on purpose: the rate itself by createdAt (same field
  // every sibling analytics function uses, so numerator/denominator stay
  // comparable), and the separate "returns processed this period" count by
  // this column -- mixing the two into one ratio would be incoherent (it
  // could exceed 100%, or read near-zero purely because recent orders
  // haven't had time to be returned yet).
  returnedAt: timestamp("returnedAt"),
  /**
   * Marketing-analytics snapshot, captured automatically at checkout (see
   * checkout.createOrder in server/routers.ts) — never asked of the
   * shopper, never backfilled for historical orders (both stay null for
   * every order placed before this shipped, which the analytics panel
   * reports honestly rather than guessing). trafficSource is the raw
   * ?utm_source/ref query param or document.referrer's hostname the
   * shopper's session started from; deviceType is parsed from the
   * request's User-Agent at order time. Both are "best guess from one
   * HTTP request", not a real multi-touch attribution system.
   */
  trafficSource: varchar("trafficSource", { length: 200 }),
  deviceType: mysqlEnum("deviceType", ["mobile", "tablet", "desktop", "unknown"]),
  // Tier E: links this order back to the anonymous browsing session that
  // placed it (see visitorSessions below), resolved server-side from the
  // session cookie at checkout — captured once, never backfilled for
  // historical orders (null forever for anything placed before this
  // shipped). The one thing that makes a real Conversion Rate possible:
  // getConversionOverview counts a session "converted" iff it has ≥1 order
  // here. Nullable + SET NULL: a visitor_sessions row is disposable
  // browsing-analytics data, not a business record — deleting old sessions
  // later must never touch the (permanent) order it produced.
  visitorSessionId: int("visitorSessionId").references(() => visitorSessions.id, { onDelete: "set null" }),
  /**
   * EBARIMT.md: Mongolian tax-receipt (е-баримт) fields. Fully inert until a
   * future session wires up real issuance (Path A: SmartSoftware POS
   * webhook/API, or Path B: direct developer.itc.gov.mn POS API 3.0 — see
   * EBARIMT.md for which path Tom's vendor conversation lands on). Every
   * order defaults to "not_issued"/null and stays that way until real
   * integration code sets these — never populate ebarimtReceiptId by hand;
   * a manually-typed value here would be a fabricated legal tax record.
   */
  ebarimtStatus: mysqlEnum("ebarimtStatus", ["not_issued", "issued", "failed"]).notNull().default("not_issued"),
  ebarimtReceiptId: varchar("ebarimtReceiptId", { length: 128 }),
  ebarimtQrData: text("ebarimtQrData"),
  ebarimtLotteryNumber: varchar("ebarimtLotteryNumber", { length: 40 }),
  adminNote: text("adminNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("orders_user_idx").on(table.userId),
  index("orders_status_idx").on(table.status),
  index("orders_ebarimt_status_idx").on(table.ebarimtStatus),
]);

export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id, { onDelete: "cascade" }),
  // Nullable + SET NULL: the row already denormalizes productName/sku/price,
  // so a later product deletion shouldn't erase order history.
  productId: int("productId").references(() => products.id, { onDelete: "set null" }),
  // PHASE 2 of product variants: which specific variant was bought, purely
  // for display/stock-restoration purposes -- productName/sku/unitPriceMnt
  // below are already the durable financial record, so a later variant
  // deletion (or a historical order predating variants) just means this is
  // null, never a broken order.
  variantId: int("variantId").references(() => productVariants.id, { onDelete: "set null" }),
  productName: varchar("productName", { length: 180 }).notNull(),
  sku: varchar("sku", { length: 80 }).notNull(),
  unitPriceMnt: int("unitPriceMnt").notNull(),
  quantity: int("quantity").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("order_items_order_idx").on(table.orderId),
  index("order_items_variant_idx").on(table.variantId),
]);

/**
 * PREMIUM-FEATURES.md TIER 2: "Итгэлийн систем" (trust system). A shopper can
 * only review a product they've actually bought — enforced at write time by
 * checking for a completed order line item, not by a schema constraint — and
 * only once per product (the unique index below), so this is a genuine
 * verified-purchase review, not an open comment board. `orderId` is captured
 * from whichever completed order qualified them, purely so the "verified
 * purchase" badge has something concrete to point at; it isn't re-checked on
 * every read.
 *
 * Moderation is deliberately lightweight (`isApproved` toggle set by admin),
 * not a pre-publish approval queue — reviews go live immediately since the
 * verified-purchase gate already keeps out anonymous spam.
 */
export const productReviews = mysqlTable("product_reviews", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: int("orderId").references(() => orders.id, { onDelete: "set null" }),
  rating: int("rating").notNull(),
  comment: text("comment"),
  isApproved: boolean("isApproved").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("product_reviews_user_product_idx").on(table.userId, table.productId),
  index("product_reviews_product_idx").on(table.productId),
]);

export type ProductReview = typeof productReviews.$inferSelect;
export type InsertProductReview = typeof productReviews.$inferInsert;

// PREMIUM-FEATURES.md TIER 4: an admin-curated, ordered product bundle
// ("Алхам 1: Цэвэрлэгч -> Алхам 2: Тонер -> ...") with an optional bundle
// discount enforced at checkout (see orders.discountMnt above) rather than
// just displayed as a marketing number.
export const routines = mysqlTable("routines", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  description: text("description"),
  discountPercent: int("discountPercent").notNull().default(0),
  isPublished: boolean("isPublished").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const routineSteps = mysqlTable("routine_steps", {
  id: int("id").autoincrement().primaryKey(),
  routineId: int("routineId").notNull().references(() => routines.id, { onDelete: "cascade" }),
  // cascade: if a product is removed from the catalog entirely, it silently
  // drops out of any routine rather than blocking the product deletion (the
  // way wishlistItems.productId already behaves for the same reason).
  productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
  stepNumber: int("stepNumber").notNull(),
  stepLabel: varchar("stepLabel", { length: 120 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("routine_steps_routine_step_idx").on(table.routineId, table.stepNumber),
  uniqueIndex("routine_steps_routine_product_idx").on(table.routineId, table.productId),
  index("routine_steps_product_idx").on(table.productId),
]);

export type Routine = typeof routines.$inferSelect;
export type InsertRoutine = typeof routines.$inferInsert;
export type RoutineStep = typeof routineSteps.$inferSelect;
export type InsertRoutineStep = typeof routineSteps.$inferInsert;

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

/**
 * Text-equivalent of site_media above: admin-editable homepage copy (see
 * shared/site-text.ts for the full slot registry and the reasoning for
 * what is / isn't covered). Same upsert-by-unique-slotKey shape,
 * deliberately no altText column since there's nothing to caption.
 */
export const siteText = mysqlTable("site_text", {
  id: int("id").autoincrement().primaryKey(),
  slotKey: varchar("slotKey", { length: 80 }).notNull().unique(),
  textValue: text("textValue").notNull(),
  updatedByUserId: int("updatedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("site_text_updated_by_idx").on(table.updatedByUserId),
]);

/**
 * Tier F of the admin analytics dashboard: CAC (Customer Acquisition Cost)
 * needs one input nothing else in this app captures -- how much was spent
 * on marketing in a given month. One row per calendar month
 * (monthKey "YYYY-MM"), upserted by an admin exactly like site_media's
 * per-slot upsert above. getCacOverview (server/analytics.ts) only ever
 * computes a real CAC figure when every month touched by the report's date
 * range has a row here -- a month with no entry means "unavailable", never
 * a silently-assumed ₮0 spend.
 */
/**
 * Tier E of the admin analytics dashboard: the minimal first-party
 * visitor/session tracking needed to compute a real Conversion Rate
 * (orders ÷ sessions — the standard formula, per Shopify's own definition).
 * Deliberately just ONE table, not a session+pageview pair like Umami/
 * Plausible/GoatCounter's fuller schemas — nothing this app needs requires
 * per-pageview granularity (no landing-page/bounce-rate report), so
 * `pageViewCount` on the session row itself is enough to know a session
 * wasn't a single-hit bounce. A page_views table can be added additively
 * later if that ever changes.
 *
 * One row per anonymous browsing session (see shared/const.ts's
 * VISITOR_SESSION_COOKIE_NAME and the client beacon in
 * client/src/lib/pageviewTracking.ts). "Session" boundary is a 30-minute
 * inactivity gap (server/db.ts's resolvePageviewSession), matching the
 * industry-standard GA/Shopify-style session window — NOT the cookie's own
 * (much longer, fixed) expiry, so one long continuous visit never
 * fragments into multiple sessions just because the cookie happens to be
 * old.
 */
export const visitorSessions = mysqlTable("visitor_sessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionToken: varchar("sessionToken", { length: 64 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  landingPath: varchar("landingPath", { length: 300 }).notNull(),
  // First-touch only, reusing the exact value client/src/lib/trafficSource.ts
  // already captures for orders.trafficSource — never overwritten after the
  // session's first pageview, same "captured once" discipline throughout
  // this file.
  trafficSource: varchar("trafficSource", { length: 200 }),
  deviceType: mysqlEnum("deviceType", ["mobile", "tablet", "desktop", "unknown"]),
  pageViewCount: int("pageViewCount").notNull().default(1),
}, table => [
  index("visitor_sessions_last_seen_idx").on(table.lastSeenAt),
  index("visitor_sessions_created_idx").on(table.createdAt),
]);

export const marketingSpend = mysqlTable("marketing_spend", {
  id: int("id").autoincrement().primaryKey(),
  monthKey: varchar("monthKey", { length: 7 }).notNull().unique(),
  spendMnt: int("spendMnt").notNull(),
  updatedByUserId: int("updatedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("marketing_spend_updated_by_idx").on(table.updatedByUserId),
]);

/**
 * Manually-entered checkout discount codes ("SALE10" etc.) — distinct from
 * the automatic routine-bundle and loyalty-tier discounts (those need no
 * code, they just apply). One of percentValue/fixedAmountMnt is set
 * depending on `type`. usesCount is incremented atomically (with a WHERE
 * guard against maxUses) only when an order actually completes — see
 * redeemDiscountCode in server/db.ts — never on a checkout preview.
 */
export const discountCodes = mysqlTable("discount_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  type: mysqlEnum("type", ["percent", "fixed"]).notNull(),
  percentValue: int("percentValue"),
  fixedAmountMnt: int("fixedAmountMnt"),
  minSubtotalMnt: int("minSubtotalMnt").notNull().default(0),
  maxUses: int("maxUses"),
  usesCount: int("usesCount").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  expiresAt: timestamp("expiresAt"),
  // RESTRICT: a discount code is a financial record (orders reference it by
  // code snapshot) -- the admin who created it shouldn't be deletable while
  // it still exists.
  createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("discount_codes_active_idx").on(table.isActive),
]);

/**
 * Admin-controlled promotional popup/banner (e.g. new-arrival announcement,
 * seasonal sale, store event). Deliberately a plain admin-editable record —
 * not a fake-urgency generator: whatever is shown is exactly what an admin
 * typed in, for exactly the window they scheduled. Several rows can exist
 * (so a sale and a launch can both be drafted ahead of time) but only the
 * single best-matching active+in-window one is ever served publicly — see
 * getActiveSitePromotion in server/db.ts.
 */
export const sitePromotions = mysqlTable("site_promotions", {
  id: int("id").autoincrement().primaryKey(),
  isActive: boolean("isActive").notNull().default(false),
  displayMode: mysqlEnum("displayMode", ["popup", "banner"]).notNull().default("popup"),
  headline: varchar("headline", { length: 160 }).notNull(),
  message: text("message"),
  imageUrl: text("imageUrl"),
  ctaLabel: varchar("ctaLabel", { length: 60 }),
  ctaUrl: varchar("ctaUrl", { length: 300 }),
  startsAt: timestamp("startsAt"),
  endsAt: timestamp("endsAt"),
  updatedByUserId: int("updatedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("site_promotions_active_idx").on(table.isActive),
]);

/**
 * TIER 4: one row per login attempt (successful or not) — auth.login writes
 * this unconditionally (see server/routers.ts), independent of the
 * transient in-memory rate limiter, so it survives a restart and backs the
 * admin "login history" view. `userId` is nullable both because a failed
 * attempt against a nonexistent email has no user to attach to, and because
 * an attempt shouldn't vanish (or block deletion) if the account is later
 * removed — see the SET NULL below.
 */
export const loginAttempts = mysqlTable("login_attempts", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  success: boolean("success").notNull(),
  // "invalid_credentials" | "suspended" | "unverified" | null (success)
  reason: varchar("reason", { length: 60 }),
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("login_attempts_email_idx").on(table.email),
  index("login_attempts_created_idx").on(table.createdAt),
  index("login_attempts_user_idx").on(table.userId),
]);

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type InsertLoginAttempt = typeof loginAttempts.$inferInsert;

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
  role: mysqlEnum("role", ["user", "staff", "admin"]).notNull().default("user"),
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
  // sha256 of a 6-digit numeric code (not a long random token — see
  // server/routers.ts auth.requestPasswordReset). NOT unique: with only 1e6
  // possible codes, two different users' pending codes can legitimately hash
  // to the same value; every lookup is always scoped by userId as well.
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  // Failed-code guesses against this row. verifyPasswordResetCode burns the
  // row (sets usedAt) once this hits MAX_CODE_ATTEMPTS, independent of the
  // IP-based rate limit on the procedure itself.
  attempts: int("attempts").notNull().default(0),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("password_reset_tokens_user_idx").on(table.userId),
  index("password_reset_tokens_expires_idx").on(table.expiresAt),
]);

/** Single-use 6-digit codes for confirming a registration / verifying an email. */
export const emailVerificationTokens = mysqlTable("email_verification_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  // sha256 of a 6-digit numeric code — see passwordResetTokens.tokenHash above
  // for why this isn't unique.
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  attempts: int("attempts").notNull().default(0),
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
export type SiteText = typeof siteText.$inferSelect;
export type InsertSiteText = typeof siteText.$inferInsert;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type InsertAdminAuditLog = typeof adminAuditLogs.$inferInsert;
export type StaffInvitation = typeof staffInvitations.$inferSelect;
export type InsertStaffInvitation = typeof staffInvitations.$inferInsert;
export type SitePromotion = typeof sitePromotions.$inferSelect;
export type InsertSitePromotion = typeof sitePromotions.$inferInsert;
export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = typeof discountCodes.$inferInsert;

/**
 * Admin-manageable third-party provider config (eBarimt/StorePay/Golomt
 * card/eBuuhia courier) — moves credentials out of .env into the DB so an
 * admin can toggle a provider and paste in its API keys without a code
 * deploy. Deliberately does NOT include "qpay": that integration already
 * works end-to-end reading straight from process.env (see server/qpay.ts)
 * and is left alone here rather than risking the one real, working payment
 * path for a refactor with no functional upside yet — the admin panel shows
 * QPay's status alongside these four, just sourced from its existing
 * env-based availability check instead of this table.
 * `encryptedConfig` is opaque ciphertext (see server/_core/crypto.ts) — the
 * app never decrypts it back out to a client; admin credential edits are
 * write-only, the same principle as a password field.
 */
export const integrationConfigs = mysqlTable("integration_configs", {
  id: int("id").autoincrement().primaryKey(),
  provider: mysqlEnum("provider", ["ebarimt", "storepay", "card_golomt", "courier_ebuuhia"]).notNull().unique(),
  isActive: boolean("isActive").notNull().default(false),
  encryptedConfig: text("encryptedConfig"),
  // Nullable + SET NULL: this is an operational/audit trail field, not
  // something that should block deleting the admin who last touched it.
  updatedByUserId: int("updatedByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type IntegrationConfig = typeof integrationConfigs.$inferSelect;
export type InsertIntegrationConfig = typeof integrationConfigs.$inferInsert;
