import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, tinyint, uniqueIndex, varchar , primaryKey } from "drizzle-orm/mysql-core";
import { ubDistricts } from "../shared/districts";
import { INTEGRATION_PROVIDERS } from "../shared/integrations";

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
  /**
   * 2026-09-05 ("remove email!!! only phone number!!!" -- Tom, explicit): the
   * app's actual login identifier now. Every new registration requires one;
   * findUserByPhone (server/db.ts) is what auth.login/auth.register resolve
   * against, matching digits-only right-anchored to the local 8-digit mobile
   * number regardless of how it was typed (spaces/dashes/+976 or not) --
   * see that function's own comment. UNIQUE below enforces one account per
   * number; every write path (register, admin.updateUserPhone,
   * attachPhoneFromVerifiedSession) normalizes to the bare 8-digit form
   * first (normalizePhoneForVerifyMn) so the unique index and the flexible
   * lookup never disagree with each other. Still doubles as the plain
   * contact number shown on the profile page, same column as before this
   * date -- not a new field, just a new load-bearing responsibility.
   */
  phone: varchar("phone", { length: 40 }).unique(),
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
  /**
   * 2026-09-05: no longer the login identifier (see `phone` above) and no
   * longer collected at registration -- kept nullable so legacy accounts
   * created before this date keep their address on file (admin display,
   * order-confirmation emails on old orders), and so nothing stops a future
   * account from optionally adding one later. Still UNIQUE among rows that
   * do have one; MySQL's unique index permits any number of NULLs, so this
   * imposes no constraint on phone-only accounts that never set it.
   */
  email: varchar("email", { length: 320 }).unique(),
  /** Meta app-scoped user id for "Continue with Facebook" (2026-09-13, migration 0072). */
  facebookId: varchar("facebookId", { length: 64 }).unique(),
  /** scrypt("<saltHex>:<hashHex>") — see server/_core/password.ts. Never sent to the client. */
  passwordHash: varchar("passwordHash", { length: 200 }).notNull(),
  // 2026-09-08 (Admin overhaul, Phase A): widened from 3 values ("user",
  // "staff", "admin") to 6 -- "staff" narrows to posts/media only, and
  // "finance"/"marketing"/"warehouse" are new department roles, each scoped
  // to its own slice of the admin panel. None of them can touch user
  // accounts/roles/integrations/security -- that stays "admin"-only. See
  // adminProcedure/staffProcedure/financeProcedure/marketingProcedure/
  // warehouseProcedure in server/_core/trpc.ts for the enforcement, and
  // server/routers.ts for which endpoint uses which.
  role: mysqlEnum("role", ["user", "staff", "finance", "marketing", "warehouse", "admin"]).default("user").notNull(),
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
  /**
   * "Controls everything" admin overhaul (2026-09-08, Phase G): a real
   * store-credit balance -- unrelated to the loyalty tier system above
   * (that's a percentage discount computed from spend history; this is
   * cash-equivalent value a finance/admin user can add for a customer-
   * service situation, e.g. "sorry about that, here's ₮10,000 credit").
   * A fast-read cache, not the source of truth -- store_credit_ledger below
   * is the actual audit trail; this column is kept in sync with it on every
   * write (see server/db.ts's adjustStoreCredit), same "cache + ledger"
   * shape as the loyalty tier's own real-order-sum-plus-manual-adjustment
   * computation elsewhere in this file.
   */
  storeCreditMnt: int("storeCreditMnt").notNull().default(0),
  /**
   * Admin face gate (2026-09-08): the moment this account last passed the
   * face check in front of /admin.
   *
   * INFORMATIONAL ONLY -- this is not what the gate actually tests, and must
   * never become that. The gate has to be per-DEVICE: passing the check on
   * the shop computer must not silently open /admin on someone's personal
   * laptop, which is exactly what a shared account-level timestamp would do.
   * The real proof is a short-lived signed cookie on the device that passed
   * (ADMIN_FACE_COOKIE_NAME in shared/const.ts). This column exists so the
   * admin UI can show "last verified ..." per account.
   */
  faceVerifiedAt: timestamp("faceVerifiedAt"),
  /**
   * 2026-09-11 (migration 0062): the admin top bar's bell lists the same
   * notifications staff get on their phones (notification_outbox rows for
   * their group). Everything with a higher id than this is "unread". Stored
   * on the account rather than in the browser so the shop PC and the
   * owner's phone agree on what has been seen. NULL = never opened.
   */
  lastSeenNotificationId: int("lastSeenNotificationId"),
  /**
   * 2026-09-11 (migration 0064): the location a staff member works at. A
   * store consultant (role 'staff') can only receive goods or count stock at
   * this branch (server/inventory.ts). NULL for everyone else. The FK
   * (SET NULL) is in the migration; declared loosely here because `branches`
   * is defined further down this file.
   */
  branchId: int("branchId"),
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
 * NEWVISION.md §5 "Топ брэндүүд" -- same shape as product_categories above.
 * `brandName` is deliberately free varchar, not a foreign key, but the admin
 * UI (AdminBrandsPanel) only ever offers a dropdown of real, currently-used
 * `products.brand` values (see getDistinctRealBrands) -- never free text --
 * so a tile can't point at zero real products. `photoUrl` is optional: when
 * unset, the customer-facing query falls back to the most recently added
 * real, published, imaged product carrying this brand (see
 * getFeaturedBrands's own comment) rather than a stock/invented image.
 */
export const featuredBrands = mysqlTable("featured_brands", {
  id: int("id").autoincrement().primaryKey(),
  brandName: varchar("brandName", { length: 120 }).notNull(),
  tagline: text("tagline"),
  photoUrl: text("photoUrl"),
  // 2026-09-10: the brand's own logo lockup, shown in its own band under the
  // square photo (see the Featured Brands carousel). Distinct from photoUrl
  // -- that is a lifestyle/product shot, this is the wordmark -- and never
  // derived from product data, so it stays null until an admin uploads one.
  logoUrl: text("logoUrl"),
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FeaturedBrand = typeof featuredBrands.$inferSelect;
export type InsertFeaturedBrand = typeof featuredBrands.$inferInsert;

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase J): replaces
 * client/src/components/home/locations-data.ts's pure hardcoded array (no
 * backing table at all until now) -- fixes a real, previously-undiscovered
 * bug as a direct side effect: branch 04 ("Japan Town C6...") existed in
 * that array but wasn't in checkout's old hardcoded pickupBranch enum, so it
 * was never actually selectable for pickup. Same shape/CRUD precedent as
 * featuredBrands above (name/photo/sortOrder/isActive, admin-managed via
 * marketingProcedure). `name` stays what orders.pickupBranch stores (a
 * free varchar, not a foreign key -- unchanged by this phase) so existing
 * historical orders' pickupBranch strings keep meaning what they already
 * mean. `isFulfillmentDefault`: exactly one branch is the designated
 * warehouse UB-delivery orders draw stock from once per-branch stock lands
 * (Phase K/L) -- store-pickup orders draw from whichever branch the
 * customer picked instead.
 */
export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  address: text("address").notNull(),
  phone: varchar("phone", { length: 40 }),
  mapUrl: text("mapUrl"),
  photoUrl: text("photoUrl"),
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  isFulfillmentDefault: boolean("isFulfillmentDefault").notNull().default(false),
  // 2026-09-11 (migration 0064). `kind`: a 'warehouse' is a stock location,
  // never a store -- not offered for pickup, not listed on the storefront.
  // `countsTowardOnlineStock`: whether this shelf is part of what the website
  // sells. The stores ring sales up in Smart POS, not here, so until that is
  // synced their counts here only ever go up; switching this off for them
  // makes online stock = warehouse stock. `lowStockThreshold`: per-location
  // low-stock alert level (NULL = no alerts there).
  kind: mysqlEnum("kind", ["store", "warehouse"]).notNull().default("store"),
  countsTowardOnlineStock: boolean("countsTowardOnlineStock").notNull().default(true),
  lowStockThreshold: int("lowStockThreshold"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Branch = typeof branches.$inferSelect;
export type InsertBranch = typeof branches.$inferInsert;

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
   * Gift cards sold at checkout (2026-09-14, migration 0076). A gift_card
   * product is digital: checkout never touches its shelf stock, a basket
   * of only gift cards has no delivery, percentage discounts skip it, and
   * the moment its order is paid the codes are minted into `gift_cards`
   * (issueGiftCardsForPaidOrder in server/db.ts). Its priceMnt IS the
   * card's value. Everything else in the catalogue is "physical".
   */
  kind: mysqlEnum("kind", ["physical", "gift_card"]).notNull().default("physical"),
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
  /**
   * Product facts (2026-09-14, migration 0079): ingredients list, net
   * content ("170ml", "3 x 50g"), country of origin, shelf life in months
   * (unopened; a period-after-opening is a different number and is left to
   * the description). All nullable; factsSource records who filled them --
   * "openfoodfacts" / "openbeautyfacts" / "openproductsfacts" by the enrich
   * script, "admin" once a person edits them in /admin (the script then
   * never overwrites that product again).
   */
  ingredients: text("ingredients"),
  netContent: varchar("netContent", { length: 80 }),
  countryOfOrigin: varchar("countryOfOrigin", { length: 80 }),
  shelfLifeMonths: int("shelfLifeMonths"),
  factsSource: varchar("factsSource", { length: 40 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("products_category_idx").on(table.categoryId),
  index("products_published_idx").on(table.isPublished),
  // 2026-09-11: join key for the featured-brand bestseller filler, the brand
  // photo fallback, and the admin brand dropdown (migration 0060).
  index("products_brand_idx").on(table.brand),
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
  // "Controls everything" admin overhaul (2026-09-08, Phase K): once
  // per-branch stock exists (branchStock below), this becomes a DERIVED,
  // CACHED total -- sum(branch_stock.stockQuantity) for this variant, kept
  // in sync on every branch-stock write (recomputeVariantStockTotal in
  // server/db.ts), same "two copies kept in sync on write" convention
  // syncSoleVariantFromProduct above already established one level up
  // (products <-> its sole variant). Every existing reader (catalog list,
  // ProductDetail, cart, the old single global-pool checkout decrement)
  // keeps working unmodified off this one column; only the checkout write
  // path (Phase L) changes to decrement a specific branch's row instead of
  // this aggregate directly.
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

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase K): the real
 * per-location stock split that used to not exist at all -- every branch
 * shared one global `productVariants.stockQuantity` number. One row per
 * (branch, variant) that actually stocks it; a variant with no row at a
 * given branch is treated as 0 there (never backfilled with a guessed
 * number -- see scripts/backfill-branch-stock.ts's own comment on why the
 * one-time seed puts 100% of existing stock at the fulfillment-default
 * branch and 0 everywhere else, the only honest starting split since no
 * real historical per-branch data exists).
 */
export const branchStock = mysqlTable("branch_stock", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  variantId: int("variantId").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
  stockQuantity: int("stockQuantity").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("branch_stock_unique").on(table.branchId, table.variantId),
  index("branch_stock_variant_idx").on(table.variantId),
]);
export type BranchStock = typeof branchStock.$inferSelect;
export type InsertBranchStock = typeof branchStock.$inferInsert;

/**
 * 2026-09-11 (migration 0063): the stock movement ledger. branch_stock is
 * the current count; this is HOW it got there -- one append-only row per
 * change to one branch's shelf of one variant, written in the same
 * transaction as that change by server/stockLedger.ts. `delta` is signed,
 * `balanceAfter` is the shelf right after, `sku` is copied at the time.
 * `refType`/`refId` point at what caused it (order, transfer, receipt,
 * count). Cascades with its branch/variant exactly like branch_stock -- the
 * app refuses to delete a branch that has history (deleteBranch), so that
 * only ever fires for test fixtures. Drift between SUM(delta) and
 * branch_stock (older code on the other laptop, a manual SQL edit) is shown
 * on System Health and re-based by scripts/stock-ledger-rebaseline.ts.
 */
export const STOCK_MOVEMENT_TYPES = [
  "opening", "sale_online", "sale_pos", "order_restock", "refund_restock", "admin_set", "product_form_set", "variant_seed",
  "receipt", "transfer_out", "transfer_in", "transfer_return", "transfer_writeoff", "count_adjust", "rebaseline",
  // Migration 0066: a sale rung up in the vendor's POS (Smart Software) and pulled in.
  "sale_pos_external",
] as const;
export const stockMovements = mysqlTable("stock_movements", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  variantId: int("variantId").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
  sku: varchar("sku", { length: 100 }).notNull(),
  type: mysqlEnum("type", STOCK_MOVEMENT_TYPES).notNull(),
  delta: int("delta").notNull(),
  balanceAfter: int("balanceAfter").notNull(),
  refType: varchar("refType", { length: 20 }),
  refId: int("refId"),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
  note: varchar("note", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("stock_movements_branch_variant_idx").on(table.branchId, table.variantId, table.id),
  index("stock_movements_variant_idx").on(table.variantId, table.id),
  index("stock_movements_ref_idx").on(table.refType, table.refId),
  index("stock_movements_created_idx").on(table.createdAt),
]);
export type StockMovement = typeof stockMovements.$inferSelect;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/**
 * 2026-09-11 (migration 0064): goods arriving at a location, recorded by
 * barcode scan (server/inventory.ts) -- replaces the handwritten A4 list
 * photographed into the work group chat. Lines are saved while scanning;
 * nothing touches stock until the receipt is posted, exactly once.
 * `scannedCode` is what the scanner read; `variantId` NULL = not in the
 * catalogue (yet).
 */
export const stockReceipts = mysqlTable("stock_receipts", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 24 }).notNull().unique(),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  supplierName: varchar("supplierName", { length: 160 }),
  supplierInvoiceNo: varchar("supplierInvoiceNo", { length: 80 }),
  invoicePhotoUrl: varchar("invoicePhotoUrl", { length: 500 }),
  status: mysqlEnum("status", ["draft", "posted", "cancelled"]).notNull().default("draft"),
  note: varchar("note", { length: 500 }),
  createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
  postedByUserId: int("postedByUserId").references(() => users.id, { onDelete: "set null" }),
  postedAt: timestamp("postedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("stock_receipts_branch_status_idx").on(table.branchId, table.status)]);

export const stockReceiptLines = mysqlTable("stock_receipt_lines", {
  id: int("id").autoincrement().primaryKey(),
  receiptId: int("receiptId").notNull().references(() => stockReceipts.id, { onDelete: "cascade" }),
  variantId: int("variantId").references(() => productVariants.id, { onDelete: "set null" }),
  scannedCode: varchar("scannedCode", { length: 80 }).notNull(),
  quantity: int("quantity").notNull(),
}, table => [uniqueIndex("stock_receipt_lines_unique").on(table.receiptId, table.scannedCode)]);

/**
 * 2026-09-11 (migration 0064): stocktakes, including a location's opening
 * count. The adjustment per line is counted - systemQtyAtFirstScan (the
 * shelf when that line was FIRST scanned), so sales during a long count are
 * not erased. A 'full' count also zeroes items nobody scanned. Store staff
 * submit; warehouse/admin post.
 */
export const stockCounts = mysqlTable("stock_counts", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 24 }).notNull().unique(),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  isOpening: boolean("isOpening").notNull().default(false),
  scope: mysqlEnum("scope", ["partial", "full"]).notNull().default("partial"),
  status: mysqlEnum("status", ["draft", "submitted", "posted", "cancelled"]).notNull().default("draft"),
  note: varchar("note", { length: 500 }),
  createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
  submittedAt: timestamp("submittedAt"),
  postedByUserId: int("postedByUserId").references(() => users.id, { onDelete: "set null" }),
  postedAt: timestamp("postedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("stock_counts_branch_status_idx").on(table.branchId, table.status)]);

export const stockCountLines = mysqlTable("stock_count_lines", {
  id: int("id").autoincrement().primaryKey(),
  countId: int("countId").notNull().references(() => stockCounts.id, { onDelete: "cascade" }),
  variantId: int("variantId").references(() => productVariants.id, { onDelete: "set null" }),
  scannedCode: varchar("scannedCode", { length: 80 }).notNull(),
  countedQty: int("countedQty").notNull(),
  systemQtyAtFirstScan: int("systemQtyAtFirstScan"),
  postedDelta: int("postedDelta"),
}, table => [uniqueIndex("stock_count_lines_unique").on(table.countId, table.scannedCode)]);

/**
 * 2026-09-11 (migration 0065): warehouse -> store transfers, checked by
 * scanning at both ends (server/transfers.ts). draft -> sent (goods leave
 * the source shelf) -> received (the store's blind scan is compared with
 * what was sent; arrivals added, differences left open for an admin to
 * resolve line by line) | cancelled.
 */
export const stockTransfers = mysqlTable("stock_transfers", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 24 }).notNull().unique(),
  fromBranchId: int("fromBranchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  toBranchId: int("toBranchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["draft", "sent", "received", "cancelled"]).notNull().default("draft"),
  discrepancyStatus: mysqlEnum("discrepancyStatus", ["none", "open", "resolved"]).notNull().default("none"),
  note: varchar("note", { length: 500 }),
  createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
  sentByUserId: int("sentByUserId").references(() => users.id, { onDelete: "set null" }),
  sentAt: timestamp("sentAt"),
  receivedByUserId: int("receivedByUserId").references(() => users.id, { onDelete: "set null" }),
  receivedAt: timestamp("receivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("stock_transfers_to_status_idx").on(table.toBranchId, table.status),
  index("stock_transfers_from_status_idx").on(table.fromBranchId, table.status),
]);

export const stockTransferLines = mysqlTable("stock_transfer_lines", {
  id: int("id").autoincrement().primaryKey(),
  transferId: int("transferId").notNull().references(() => stockTransfers.id, { onDelete: "cascade" }),
  variantId: int("variantId").references(() => productVariants.id, { onDelete: "set null" }),
  scannedCode: varchar("scannedCode", { length: 80 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  productName: varchar("productName", { length: 255 }),
  qtySent: int("qtySent").notNull().default(0),
  receivedDraftQty: int("receivedDraftQty"),
  qtyReceived: int("qtyReceived"),
  resolution: mysqlEnum("resolution", ["write_off", "returned_to_source", "found_later", "deducted_from_source", "accepted_over"]),
  resolutionNote: varchar("resolutionNote", { length: 300 }),
}, table => [uniqueIndex("stock_transfer_lines_unique").on(table.transferId, table.scannedCode)]);

export const carts = mysqlTable("carts", {
  id: int("id").autoincrement().primaryKey(),
  // Exactly one of userId / guestToken is set. Nullable (guest checkout):
  // an anonymous shopper's cart is identified by an opaque cookie token
  // instead of an account. See server/db.ts's CartOwner type.
  userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
  guestToken: varchar("guestToken", { length: 64 }),
  status: mysqlEnum("status", ["active", "converted", "abandoned"]).notNull().default("active"),
  // "Controls everything" admin overhaul (2026-09-08, Phase E): set the
  // first time the abandoned-cart reminder job (server/_core/scheduler.ts)
  // emails this cart's owner, so a still-abandoned cart is never reminded
  // twice. Nullable/unset for every cart that hasn't (yet, or ever) crossed
  // getCartAbandonment's staleness definition.
  reminderSentAt: timestamp("reminderSentAt"),
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
  // "Controls everything" admin overhaul (2026-09-08, Phase M): "in_store"
  // added for the POS tool (recordInStoreSale) -- a real register sale
  // collected in person, distinct from every online method above.
  paymentMethod: mysqlEnum("paymentMethod", ["qpay", "storepay", "bank_transfer", "card", "cash_on_delivery", "in_store"]).notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["unpaid", "paid", "refunded"]).notNull().default("unpaid"),
  deliveryMethod: mysqlEnum("deliveryMethod", ["ub_delivery", "store_pickup"]).notNull(),
  // Phase M: a genuine online-vs-physical channel signal -- today's channel
  // breakdown in analytics only ever distinguished delivery-vs-pickup/
  // payment-method, never "did this actually happen on the website."
  // in_store orders always use deliveryMethod:"store_pickup" too (a
  // register sale IS picked up on the spot), so this is the one column
  // that actually separates the two.
  // "phone" / "messenger" (2026-09-14, migration 0078): keyed in by staff
  // for a customer who ordered by phone or Facebook Messenger.
  salesChannel: mysqlEnum("salesChannel", ["online", "in_store", "phone", "messenger"]).notNull().default("online"),
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
  // "Controls everything" admin overhaul (2026-09-08, Phase L): which
  // branch's branch_stock rows this order's items were actually decremented
  // from -- captured once, at order-creation time (store_pickup: the
  // customer's chosen branch; ub_delivery: whichever branch was
  // isFulfillmentDefault at that moment). Restoring stock on cancellation
  // reads THIS column, never "whichever branch is currently marked
  // default" -- an admin could reassign the fulfillment-default branch
  // between order placement and a later cancellation, and re-deriving at
  // cancel-time would then credit back the wrong branch's shelf. Nullable
  // only for orders placed before this column existed.
  fulfillingBranchId: int("fulfillingBranchId").references(() => branches.id, { onDelete: "set null" }),
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
   * "Controls everything" admin overhaul (2026-09-08, Phase I): how much of
   * this order's final total was paid with store credit (users.storeCreditMnt),
   * applied LAST against the already-discounted total -- credit is
   * cash-equivalent, not a percentage promo, so it never stacks with or
   * changes the routine/coupon/loyalty discount math above, it just reduces
   * what's actually owed after those are all resolved.
   */
  storeCreditAppliedMnt: int("storeCreditAppliedMnt").notNull().default(0),
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
   * Admin overhaul (2026-09-08, Phase E): the refund/credit flow the
   * returnedAt comment above flagged as "separate, unscoped work" -- now
   * scoped. Single-column, matching returnedAt's own precedent (one
   * terminal event per order, not a separate refunds table) because Tom's
   * flow is "mark returned, then record one refund," not multi-tranche
   * partial refunds. Set exactly once, by financeProcedure's admin.refundOrder
   * (server/db.ts's refundOrder), the only place paymentStatus ever becomes
   * "refunded" -- see refundOrder's own guards (must be status="returned",
   * must not already be paymentStatus="refunded", amount capped at totalMnt).
   */
  refundAmountMnt: int("refundAmountMnt"),
  refundedAt: timestamp("refundedAt"),
  refundNote: varchar("refundNote", { length: 300 }),
  /** Review request (2026-09-14, migration 0080): set once the review-request job has asked this buyer -- never twice. */
  reviewRequestedAt: timestamp("reviewRequestedAt"),
  /** Return request from the profile (2026-09-14): the customer's ask; staff decide (status "returned" + refund). */
  returnRequestedAt: timestamp("returnRequestedAt"),
  returnRequestReason: varchar("returnRequestReason", { length: 500 }),
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
  /**
   * 2026-09-12 (migration 0069): the checkout's idempotency key. One random
   * id per checkout attempt, generated in the browser; the same id always
   * resolves to the same order, so a timed-out request that the server had
   * in fact committed, a browser retry, or a second tab cannot place the
   * basket twice. Nullable: orders predating this, and POS sales, have none.
   */
  clientRequestId: varchar("clientRequestId", { length: 64 }),
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
  // Backend audit (2026-09-02): queried by eq(orders.paymentStatus, "paid")
  // in getBestsellingProducts/getRecommendedProducts/the admin dashboard,
  // and by ORDER BY desc(orders.createdAt) in getAdminOrders/the admin
  // dashboard's recent-orders list -- neither had an index. Invisible at
  // today's ~4 real orders; cheap to add now, before it isn't.
  index("orders_payment_status_idx").on(table.paymentStatus),
  index("orders_created_at_idx").on(table.createdAt),
  uniqueIndex("orders_client_request_unique").on(table.clientRequestId),
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

// Threaded review conversations (2026-09-13, migration 0070). Replies are a
// separate table on purpose: product_reviews carries the one-review-per-
// buyer unique key and a NOT NULL rating, neither of which a reply has.
// Who may reply is decided in server/db.ts createReviewReply (the review
// author, another verified buyer of the product, or panel staff answering
// for the shop -- the reader sees a "SUGI ASAYAKE" badge on staff replies).
export const productReviewReplies = mysqlTable("product_review_replies", {
  id: int("id").autoincrement().primaryKey(),
  reviewId: int("reviewId").notNull().references(() => productReviews.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  isApproved: boolean("isApproved").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("product_review_replies_review_idx").on(table.reviewId),
]);

export type ProductReviewReply = typeof productReviewReplies.$inferSelect;

/**
 * Product Q&A (2026-09-13, migration 0071). Any signed-in customer may ask;
 * answers come from panel staff or from customers who bought the product
 * (same rule as review replies). Both bodies pass moderation before insert.
 * isApproved=false hides the row from the storefront (admin moderation).
 */
export const productQuestions = mysqlTable("product_questions", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  isApproved: boolean("isApproved").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("product_questions_product_idx").on(table.productId, table.createdAt)]);

export const productQuestionAnswers = mysqlTable("product_question_answers", {
  id: int("id").autoincrement().primaryKey(),
  questionId: int("questionId").notNull().references(() => productQuestions.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  isApproved: boolean("isApproved").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("product_question_answers_question_idx").on(table.questionId)]);

export type ProductQuestion = typeof productQuestions.$inferSelect;
export type ProductQuestionAnswer = typeof productQuestionAnswers.$inferSelect;

/** One row per (review, user) -- a like is a toggle, never a count a user
 *  can inflate. */
export const productReviewLikes = mysqlTable("product_review_likes", {
  reviewId: int("reviewId").notNull().references(() => productReviews.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.reviewId, table.userId] }),
]);

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
  // 2026-09-12 (migration 0067): StorePay joins QPay. A StorePay loan id
  // lives in providerInvoiceId, so every attempt lookup stays provider-agnostic.
  provider: mysqlEnum("provider", ["qpay", "storepay"]).notNull(),
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
  // 2026-09-07 (WordPress-parity admin editor rebuild): soft-delete (Trash,
  // matching WP's Trash/Restore/"Delete Permanently" 3-state flow instead of
  // the previous hard delete), SEO fields (this codebase had zero per-entity
  // SEO-field precedent anywhere before this — replaces WP's rarely-useful
  // "Custom Fields" box with something that actually plugs a real gap), and
  // `format` (WP post format — stored for fidelity with the reference
  // screenshot; no template branches on it yet, same as most real WP themes).
  // Scheduling deliberately reuses publishedAt/isPublished rather than adding
  // a status enum — see getPublishedPosts/getPublishedPostBySlug's
  // `publishedAt <= NOW()` gate in server/db.ts.
  deletedAt: timestamp("deletedAt"),
  metaTitle: varchar("metaTitle", { length: 70 }),
  metaDescription: varchar("metaDescription", { length: 160 }),
  format: varchar("format", { length: 20 }).notNull().default("standard"),
  // RESTRICT: content should never silently disappear because its author's
  // account was removed — reassign/delete the posts first.
  createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("posts_published_idx").on(table.isPublished),
  index("posts_created_by_idx").on(table.createdByUserId),
  index("posts_deleted_idx").on(table.deletedAt),
]);

// 2026-09-07: post taxonomy (WordPress-parity editor). Flat (no parent/child
// nesting — not worth the complexity at this blog's scale). Many-to-many via
// join tables, same shape as productCategories' relationship to products
// elsewhere in this file.
export const postCategories = mysqlTable("post_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const postCategoryLinks = mysqlTable("post_category_links", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull().references(() => posts.id, { onDelete: "cascade" }),
  categoryId: int("categoryId").notNull().references(() => postCategories.id, { onDelete: "cascade" }),
}, table => [
  uniqueIndex("post_category_links_unique").on(table.postId, table.categoryId),
  index("post_category_links_category_idx").on(table.categoryId),
]);

// Tags are free-text, created on the fly by name (matches WordPress's tag
// input behavior) rather than picked from a fixed admin-managed list like
// categories.
export const postTags = mysqlTable("post_tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 60 }).notNull().unique(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const postTagLinks = mysqlTable("post_tag_links", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull().references(() => posts.id, { onDelete: "cascade" }),
  tagId: int("tagId").notNull().references(() => postTags.id, { onDelete: "cascade" }),
}, table => [
  uniqueIndex("post_tag_links_unique").on(table.postId, table.tagId),
  index("post_tag_links_tag_idx").on(table.tagId),
]);

// 2026-09-07: real media library backing the new Posts editor's "Add Media"
// modal (no such concept existed anywhere in this codebase before — every
// prior upload surface was "pick one new file, fill exactly one URL slot").
// Every upload through admin.uploadMedia records a row here so the library
// can be listed/searched fast without a live R2 bucket scan. Deliberately
// scoped to the new upload path only — existing product-image/site-media
// uploads are untouched.
export const mediaLibrary = mysqlTable("media_library", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 500 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  fileName: varchar("fileName", { length: 200 }).notNull(),
  contentType: varchar("contentType", { length: 50 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  uploadedByUserId: int("uploadedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("media_library_created_idx").on(table.createdAt),
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
 * The three legal pages (/privacy, /terms, /returns) -- 2026-09-12.
 *
 * Same override-a-code-fallback contract as siteText/siteMedia/
 * storeSettings above: a row here replaces the corresponding entry in
 * shared/site-documents.ts, deleting it restores that entry verbatim.
 * `contentHtml` passes through server/_core/sanitizeHtml.ts on every write,
 * exactly like posts.content, because the same TinyMCE "Text" tab that can
 * paste arbitrary HTML edits it.
 *
 * `updatedLabel` is the editorial "Сүүлд шинэчилсэн" stamp, kept separate
 * from `updatedAt` on purpose -- a legal document's stated revision date is
 * a claim the shop makes, not the row's modification time (fixing a typo
 * should not advance it).
 */
export const siteDocuments = mysqlTable("site_documents", {
  id: int("id").autoincrement().primaryKey(),
  documentKey: varchar("documentKey", { length: 40 }).notNull(),
  // 2026-09-14: one row per language ("mn" | "en" | "ja"); the code fallback
  // in shared/site-documents.ts carries all three, so a language with no
  // row still renders a full document.
  locale: varchar("locale", { length: 2 }).notNull().default("mn"),
  title: varchar("title", { length: 200 }).notNull(),
  lead: text("lead"),
  contentHtml: text("contentHtml").notNull(),
  updatedLabel: varchar("updatedLabel", { length: 40 }),
  updatedByUserId: int("updatedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("site_documents_key_locale_unique").on(table.documentKey, table.locale),
  index("site_documents_updated_by_idx").on(table.updatedByUserId),
]);

/**
 * The cumulative-lifetime-spend discount ladder (2026-09-12).
 *
 * Previously shared/loyalty.ts's LOYALTY_TIERS constant. It mirrors the
 * tiers configured on the shop's own POS, so it is a business setting the
 * owner changes, not a code decision -- but it is also ENFORCED (server/
 * db.ts's getApplicableLoyaltyDiscount computes a real discount from it),
 * which is why it gets a proper table with its own rows rather than a
 * JSON blob in store_settings: an admin edits one tier's percentage
 * without the risk of hand-editing JSON that prices every order.
 *
 * shared/loyalty.ts keeps the same four tiers as the fallback used when
 * the table is empty or unreachable, so a DB hiccup can never silently
 * grant or revoke everyone's discount.
 */
export const loyaltyTiers = mysqlTable("loyalty_tiers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 60 }).notNull().unique(),
  discountPercent: int("discountPercent").notNull().default(0),
  minSpendMnt: int("minSpendMnt").notNull().default(0),
  sortOrder: int("sortOrder").notNull().default(0),
  updatedByUserId: int("updatedByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("loyalty_tiers_min_spend_idx").on(table.minSpendMnt),
]);

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase A): a NEW table,
 * not a reuse of site_text above -- that table's own doc-comment scopes it
 * to homepage marketing copy, and these are business-rule values (delivery
 * fee, free-shipping threshold, transactional email prose), a different
 * semantic category deliberately kept in its own narrow table (same
 * precedent as site_promotions/marketing_spend each getting their own table
 * instead of being folded into a do-everything config blob). Same
 * upsert-by-unique-settingKey shape as site_media/site_text; every reader
 * of a settingKey falls back to a hardcoded code constant when the row is
 * absent (see server/db.ts's getStoreSetting), so an unconfigured setting
 * never breaks anything -- identical contract to the other two tables.
 */
export const storeSettings = mysqlTable("store_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 80 }).notNull().unique(),
  settingValue: varchar("settingValue", { length: 2000 }).notNull(),
  updatedByUserId: int("updatedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("store_settings_updated_by_idx").on(table.updatedByUserId),
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
  // Audit 2026-09-09 (R1): maxUses above is a GLOBAL budget -- with only
  // that, one shopper could redeem a percent code on every order until the
  // whole budget was gone. NULL = unlimited per customer (today's behaviour
  // for every existing code); N = each customer (matched by account, or by
  // phone for guests) may redeem this code on at most N non-cancelled
  // orders. Enforced in validateDiscountCode (server/db.ts).
  maxUsesPerCustomer: int("maxUsesPerCustomer"),
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

/**
 * verify.mn (Mongolian Mobile-Originated SMS) phone-verification sessions --
 * backs BOTH register (optional "verify your phone" step) and forgot-password
 * (a phone-based alternative to the email code above, added 2026-09-05
 * specifically because Brevo email delivery has been unreliable for Tom --
 * see docs/PROJECT-GUIDE.md). We never generate or check the SMS code ourselves;
 * verify.mn's own API does that match. This table only remembers which
 * local account/purpose a verify.mn sessionId unlocks, and guards against
 * replay via consumedAt.
 */
export const phoneVerificationSessions = mysqlTable("phone_verification_sessions", {
  id: int("id").autoincrement().primaryKey(),
  // NULL during register (no account exists yet at session-creation time);
  // set for password_reset, resolved by looking up users.phone.
  userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
  // "checkout" (2026-09-14, migration 0077): a guest proving the phone on
  // their order -- see checkout.createOrder in server/routers.ts.
  purpose: mysqlEnum("purpose", ["register", "password_reset", "checkout"]).notNull(),
  // Normalized digits only (see server/verifyMn.ts's normalizePhoneForVerifyMn).
  phone: varchar("phone", { length: 20 }).notNull(),
  verifyMnSessionId: varchar("verifyMnSessionId", { length: 64 }).notNull(),
  // The 6-digit code we asked the user to text back -- not a secret we check
  // ourselves (verify.mn's API is the one that matches it), kept only for
  // support/debugging.
  code: varchar("code", { length: 6 }).notNull(),
  // Cached last-known verify.mn status; the source of truth is always a live
  // GET /sessions/{id} (see getSessionStatus in server/verifyMn.ts), never
  // this column alone.
  status: mysqlEnum("status", ["pending", "verified", "expired"]).notNull().default("pending"),
  // Set once a VERIFIED session is actually spent (password changed / phone
  // attached) -- prevents replaying the same verified session twice.
  consumedAt: timestamp("consumedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("phone_verification_sessions_user_idx").on(table.userId),
  uniqueIndex("phone_verification_sessions_verifymn_idx").on(table.verifyMnSessionId),
  index("phone_verification_sessions_phone_purpose_idx").on(table.phone, table.purpose),
]);

export type PhoneVerificationSession = typeof phoneVerificationSessions.$inferSelect;
export type InsertPhoneVerificationSession = typeof phoneVerificationSessions.$inferInsert;

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
  // The one provider list (shared/integrations.ts) -- migration 0062 widened
  // the column to match when 'ntfy' and 'smartsoftware' were added.
  provider: mysqlEnum("provider", INTEGRATION_PROVIDERS).notNull().unique(),
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

/**
 * 2026-09-11 (migration 0062): phone push notifications. Every push is
 * written here first, inside the same transaction as the event that caused
 * it, and delivered afterwards by server/notifications.ts -- so a rolled-back
 * checkout never announces an order, and a slow ntfy.sh never slows a
 * checkout down. One row per recipient GROUP (warehouse/admin/finance/store,
 * see shared/notification-events.ts), not per person: each group is one ntfy
 * topic its members subscribe to on their phones.
 *
 * `dedupeKey` + the unique index turn repeated events (QPay delivers its
 * callback at least once) into one notification; NULL never collides.
 * `status`:
 *   pending    -> waiting (or waiting to retry, see nextAttemptAt)
 *   sending    -> claimed by one machine; the claim is a guarded UPDATE, so
 *                 two laptops sharing this database never both send it
 *   sent/failed -> terminal
 *   suppressed -> written but deliberately never sent (the test suite, or an
 *                 event the admin switched off)
 *   expired    -> sat undelivered for 2h+; sending it now would only confuse
 * Message text never contains customer PII -- the payload types in
 * shared/notification-events.ts have no name/phone/address fields at all.
 */
export const notificationOutbox = mysqlTable("notification_outbox", {
  id: int("id").autoincrement().primaryKey(),
  eventType: varchar("eventType", { length: 60 }).notNull(),
  groupKey: varchar("groupKey", { length: 40 }).notNull(),
  dedupeKey: varchar("dedupeKey", { length: 160 }),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  priority: tinyint("priority").notNull().default(3),
  tagsJson: varchar("tagsJson", { length: 300 }),
  clickPath: varchar("clickPath", { length: 300 }),
  status: mysqlEnum("status", ["pending", "sending", "sent", "failed", "suppressed", "expired"]).notNull().default("pending"),
  attempts: int("attempts").notNull().default(0),
  lastError: varchar("lastError", { length: 300 }),
  claimedAt: timestamp("claimedAt"),
  nextAttemptAt: timestamp("nextAttemptAt").defaultNow().notNull(),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("notification_outbox_dedupe_unique").on(table.groupKey, table.dedupeKey),
  index("notification_outbox_status_next_idx").on(table.status, table.nextAttemptAt),
  index("notification_outbox_group_id_idx").on(table.groupKey, table.id),
]);
export type NotificationOutboxRow = typeof notificationOutbox.$inferSelect;

/**
 * 2026-09-11 (migration 0066): our id <-> a vendor's id (Smart Software, see
 * server/integrations/inventorySync.ts). Products need no row -- the JAN
 * barcode is already the shared key. Unique both ways.
 */
export const externalRefs = mysqlTable("external_refs", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull(),
  entityType: mysqlEnum("entityType", ["branch", "variant", "user", "sale"]).notNull(),
  entityId: int("entityId").notNull(),
  externalId: varchar("externalId", { length: 120 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("external_refs_ours_unique").on(table.provider, table.entityType, table.entityId),
  uniqueIndex("external_refs_theirs_unique").on(table.provider, table.entityType, table.externalId),
]);

/** One row per (provider, stream): cursor + last run/success/error. */
export const integrationSyncState = mysqlTable("integration_sync_state", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull(),
  stream: varchar("stream", { length: 40 }).notNull(),
  cursor: varchar("cursor", { length: 200 }),
  lastRunAt: timestamp("lastRunAt"),
  lastOkAt: timestamp("lastOkAt"),
  lastError: varchar("lastError", { length: 500 }),
}, table => [uniqueIndex("integration_sync_state_unique").on(table.provider, table.stream)]);

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase D): the only
 * piece of scheduled/background-job infrastructure in this app (see
 * server/_core/scheduler.ts) -- before this, nothing here was genuinely
 * time-based; "scheduled" posts were a lazy `publishedAt <= NOW()` filter
 * checked at read time, not a real timer. `jobName` is the primary key
 * (not a separate autoincrement id) -- there's exactly one row per
 * registered job, upserted every time it runs, so the job's own name IS
 * its natural identity. DB-backed rather than an in-memory timestamp so a
 * `tsx watch` restart (dev) or a real deploy doesn't make an overdue job
 * fire again immediately, or a just-run job fire a second time moments
 * after a restart.
 */
export const scheduledJobRuns = mysqlTable("scheduled_job_runs", {
  jobName: varchar("jobName", { length: 80 }).primaryKey(),
  lastRunAt: timestamp("lastRunAt").defaultNow().notNull(),
});
export type ScheduledJobRun = typeof scheduledJobRuns.$inferSelect;

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase G): the actual
 * audit trail behind users.storeCreditMnt's cache column -- an append-only
 * ledger (never updated/deleted in place) rather than just a mutable
 * balance, so a customer-service credit adjustment has visible history
 * (who did it, why, and -- when it was spent -- which order it paid for).
 * `deltaMnt` is signed: positive when an admin issues/increases credit,
 * negative when a checkout consumes it.
 * `actorUserId` is null when a customer consumes their own credit at
 * checkout (no admin involved) and set when an admin issues/adjusts it;
 * `orderId` is null until the moment this row represents credit actually
 * being spent on a specific order. `userId` cascades (a ledger row has no
 * meaning without the customer it belongs to, same as wishlist_items);
 * `actorUserId`/`orderId` use "set null" instead -- they're references to
 * OTHER entities the row can safely outlive without losing its own meaning
 * (a customer's credit history shouldn't vanish because the admin who once
 * adjusted it, or an unrelated order, was later deleted).
 */
export const storeCreditLedger = mysqlTable("store_credit_ledger", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  deltaMnt: int("deltaMnt").notNull(),
  reason: varchar("reason", { length: 300 }).notNull(),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
  orderId: int("orderId").references(() => orders.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("store_credit_ledger_user_idx").on(table.userId),
]);
export type StoreCreditLedgerEntry = typeof storeCreditLedger.$inferSelect;

/**
 * Audit 2026-09-09 (R3): shared counters behind the STRICT rate-limit tiers
 * (login / register / password reset / checkout / phone verification -- see
 * server/_core/persistentRateLimit.ts). The general and cart tiers stay in
 * process memory (server/_core/security.ts) because they run on every
 * request and a database round trip there would cost more than it protects;
 * the strict tiers are low-volume brute-force targets where the limit MUST
 * hold across every server instance, which an in-memory Map cannot do the
 * moment the app runs on more than one process. Rows are upserted with one
 * atomic INSERT ... ON DUPLICATE KEY UPDATE and swept once expired.
 */
export const rateLimitBuckets = mysqlTable("rate_limit_buckets", {
  bucketKey: varchar("bucketKey", { length: 200 }).primaryKey(),
  count: int("count").notNull().default(1),
  resetAt: timestamp("resetAt").notNull(),
}, table => [
  index("rate_limit_buckets_reset_idx").on(table.resetAt),
]);

/**
 * Admin face gate (2026-09-08) -- one enrolled face reference per staff
 * account, used as a second factor in front of /admin on top of the existing
 * phone+password login. Covers all 5 panel roles, not just admin.
 *
 * WHAT IS STORED, AND WHAT DELIBERATELY IS NOT: `descriptorJson` is a
 * 128-number vector, not a photo. It is the output of the face-recognition
 * model (dlib's `face_recognition_resnet_model_v1`, released by its author
 * into the public domain -- deliberately chosen over the more accurate
 * ArcFace/InsightFace models, whose pretrained weights are licensed for
 * non-commercial research only and would have meant either buying a
 * commercial licence or shipping legal exposure into a real business).
 * No enrollment photograph is ever written to the database or to R2. The
 * vector is not reversible into a recognisable face, and on its own it
 * cannot be used to search for this person anywhere else.
 *
 * WHERE THE MATH RUNS: the model runs in the staff member's own browser
 * (client/public/face-models/, served from this site, no CDN and no third
 * party). The browser sends only the resulting 128 numbers; camera frames
 * never leave the machine. This is why there is no image column here and no
 * upload endpoint in the flow.
 *
 * HONEST LIMITATION, recorded so nobody later mistakes this for more than it
 * is: because the descriptor is computed client-side, a technically capable
 * attacker who ALREADY has the account's password could call the verify
 * endpoint directly with a descriptor of their choosing. That does not get
 * them in -- they would have to supply a vector within matching distance of
 * this enrolled one, which they cannot read and cannot guess -- but it does
 * mean the liveness challenge is a deterrent against a casual attacker
 * holding up a photo, not a defence against a determined one. This is a
 * second factor behind a password, and is documented as such in the UI.
 */
export const faceEnrollments = mysqlTable("face_enrollments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** JSON array of 128 floats -- the averaged reference descriptor. Averaged
   *  across several capture frames at enrollment rather than taken from one
   *  shot, which measurably reduces false rejections later (one bad frame at
   *  enrollment otherwise poisons every future comparison). */
  descriptorJson: text("descriptorJson").notNull(),
  /** How many frames were averaged into descriptorJson. Shown in the admin UI
   *  so a poor-quality enrollment (1-2 frames) is visible rather than silent. */
  sampleCount: int("sampleCount").notNull().default(1),
  /**
   * Descriptors captured from several guided head positions during
   * enrollment, as [{ pose, descriptor }].
   *
   * WHY: descriptorJson alone is a single frontal viewpoint. Enrolling from
   * one angle and then matching a person who happens to be sitting slightly
   * turned compares two genuinely different views of the same face, which
   * inflates the distance and causes false rejections. Storing the face from
   * several angles and taking the CLOSEST match at verification is how the
   * reference stays valid across normal, everyday sitting positions.
   *
   * Nullable: enrollments made before this existed keep working off
   * descriptorJson alone, so nobody is forced to re-enroll.
   */
  posesJson: text("posesJson"),
  /** Which model produced this vector. Descriptors from different models are
   *  NOT comparable, so a future model upgrade must re-enroll everyone -- this
   *  column is what makes that detectable instead of silently comparing
   *  incompatible vectors and rejecting everyone. */
  modelVersion: varchar("modelVersion", { length: 60 }).notNull(),
  /** When the staff member accepted the dedicated biometric-consent screen.
   *  Separate from any general terms acceptance on purpose: face data is
   *  sensitive personal data under Mongolia's Personal Data Protection Law,
   *  and bundled consent does not satisfy it. */
  consentedAt: timestamp("consentedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("face_enrollments_user_idx").on(table.userId),
]);
export type FaceEnrollment = typeof faceEnrollments.$inferSelect;

/**
 * Admin face gate (2026-09-08): the short-lived liveness challenge issued
 * between "start a check" and "submit the result". Mirrors
 * phone_verification_sessions above, including its consumedAt single-use
 * guard, which is claimed atomically (UPDATE ... WHERE consumedAt IS NULL,
 * checking affectedRows) rather than read-then-write -- the same TOCTOU fix
 * applied to the phone sessions in the 2026-09-06 audit (BUG-003).
 *
 * A DB row rather than a signed cookie because a challenge MUST be usable
 * exactly once and must be revocable server-side, which a stateless value
 * cannot guarantee on its own.
 */
export const faceChallenges = mysqlTable("face_challenges", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Which action the user must perform on camera. Randomised per attempt so a
   *  static photo held up to the lens cannot satisfy it, and so a replayed
   *  recording of a previous successful attempt is unlikely to match. */
  action: mysqlEnum("action", ["blink", "turn_left", "turn_right", "open_mouth"]).notNull(),
  consumedAt: timestamp("consumedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("face_challenges_user_idx").on(table.userId),
]);
export type FaceChallenge = typeof faceChallenges.$inferSelect;

/**
 * Admin face gate (2026-09-08): append-only audit trail of every gate event,
 * feeding its own tab in the admin Security Center. Same role login_attempts
 * plays for password logins -- an admin needs to be able to see "someone
 * failed the face check on this account six times last night."
 *
 * `distance` is the computed Euclidean distance to the enrolled descriptor
 * (null when the attempt failed before it got that far). Recorded on purpose:
 * the match threshold needs empirical tuning against real staff faces rather
 * than blind trust in a library default, and this column is the only way to
 * see the actual distribution of real successes and failures.
 */
export const faceAttempts = mysqlTable("face_attempts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
  // 2026-09-12 (migration 0068): 'idle_locked' -- /admin locked itself after
  // 25 idle minutes. An audit trail that holds only failures cannot answer
  // "was this screen left unattended?", so the lock is recorded too.
  outcome: mysqlEnum("outcome", ["enrolled", "verified", "no_match", "liveness_failed", "error", "idle_locked"]).notNull(),
  distance: int("distance"),
  detail: varchar("detail", { length: 160 }),
  ip: varchar("ip", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("face_attempts_user_idx").on(table.userId),
  index("face_attempts_created_idx").on(table.createdAt),
]);
export type FaceAttempt = typeof faceAttempts.$inferSelect;

/**
 * Gift cards (2026-09-13, migration 0073). Issued by finance/admin (later:
 * by a paid order via purchaseOrderId); redeemed once into store credit.
 */
export const giftCards = mysqlTable("gift_cards", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 24 }).notNull().unique(),
  amountMnt: int("amountMnt").notNull(),
  status: mysqlEnum("status", ["active", "redeemed", "void"]).default("active").notNull(),
  issuedByUserId: int("issuedByUserId").references(() => users.id, { onDelete: "set null" }),
  purchaseOrderId: int("purchaseOrderId").references(() => orders.id, { onDelete: "set null" }),
  redeemedByUserId: int("redeemedByUserId").references(() => users.id, { onDelete: "set null" }),
  redeemedAt: timestamp("redeemedAt"),
  recipientName: varchar("recipientName", { length: 120 }),
  note: varchar("note", { length: 300 }),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GiftCard = typeof giftCards.$inferSelect;

/** Customer Web Push subscriptions (2026-09-13, migration 0074). One row per browser. */
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: varchar("endpoint", { length: 1000 }).notNull(),
  p256dh: varchar("p256dh", { length: 200 }).notNull(),
  auth: varchar("auth", { length: 100 }).notNull(),
  userAgent: varchar("userAgent", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
}, table => [index("push_subscriptions_user_idx").on(table.userId)]);
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
