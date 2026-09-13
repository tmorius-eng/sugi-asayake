import { COOKIE_NAME, GUEST_CART_COOKIE_NAME, NOT_ADMIN_ERR_MSG, VISITOR_SESSION_COOKIE_NAME } from "@shared/const";
import { formatVariantAttributes } from "@shared/catalog-filter";
import { ubDistricts } from "@shared/districts";
import { parseDeviceType, isLikelyBot } from "@shared/deviceType";
import { slugify } from "@shared/slugify";
import { looksLikeBarcode, MAX_BARCODE_LENGTH, normaliseBarcode } from "@shared/barcode";
import { invalidateIndexHtmlCache } from "./_core/indexHtml";
import { legalDocumentKeys } from "@shared/legal-documents";
import { TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getGuestCartCookieOptions, getSessionCookieOptions, getVisitorSessionCookieOptions } from "./_core/cookies";
import { listRecentHoneybadgerFaults } from "./_core/honeybadgerReadApi";
import { getRecentSqlQueries } from "./_core/sqlQueryLog";
import { getOrSetCached } from "./_core/ttlCache";
import { sendAccountEmail, sendAccountSms } from "./_core/notification";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { signSessionToken, type TrpcContext } from "./_core/context";
import { hashPassword, verifyPassword } from "./_core/password";
import {
  addCartItem,
  addWishlistItem,
  adminGlobalSearch,
  bumpUserSessionVersion,
  type CartOwner,
  categoryExists,
  changeUserPassword,
  clearWishlistNotifyFlagsForProduct,
  createAdminCategory,
  createAdminPost,
  createAdminPostCategory,
  createAdminProduct,
  createAdminProductVariant,
  createAdminDiscountCode,
  createAdminRoutine,
  createFeaturedBrand,
  updateFeaturedBrand,
  deleteFeaturedBrand,
  getAdminFeaturedBrands,
  getAdminBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  getBranchStockForVariant,
  setBranchStock,
  getStorefrontBranches,
  updateAdminUserBranch,
  getStockMovementsForVariant,
  getStockLedgerHealth,
  recordInStoreSale,
  searchVariantsForBranch,
  getDistinctRealBrands,
  getBrandDirectory,
  getFeaturedBrands,
  getFeaturedReviews,
  createAdminSitePromotion,
  createOrderFromActiveCart,
  createProductReview,
  getActiveCartForOwner,
  getApplicableLoyaltyDiscount,
  getApplicableRoutineDiscount,
  getUserLoyaltyStatus,
  createQPayPaymentAttempt,
  createStorepayPaymentAttempt,
  createUserAddress,
  dbPing,
  deleteAdminDiscountCode,
  deleteAdminReview,
  deleteAdminRoutine,
  deleteAdminSitePromotion,
  deleteUserAccount,
  deleteUserAddress,
  discountCodeExists,
  trashAdminPost,
  restoreAdminPost,
  permanentlyDeleteAdminPost,
  deleteAdminProduct,
  deleteAdminProductVariant,
  getActiveSitePromotion,
  getAdminAuditLogs,
  getAdminDiscountCodes,
  getAdminIntegrations,
  getAdminSitePromotions,
  findProductBySku,
  getAdminCategories,
  getAdminDashboardSummary,
  getAdminOrders,
  getAdminPosts,
  getAdminPostCategories,
  getAdminMediaLibrary,
  insertMediaLibraryItem,
  getAdminProducts,
  getAdminProductVariants,
  getAdminReviews,
  getAdminRoutineDetail,
  getAdminRoutines,
  getAdminUserDetail,
  getAdminUsers,
  getCategoryWriteConflicts,
  getLatestQPayPaymentAttemptForOrder,
  getLoginHistory,
  getOrderForUser,
  getOrdersForUser,
  getProductBySlug,
  getPublishedProductBySku,
  getPublishedCategories,
  getSiteDocuments,
  upsertSiteDocument,
  deleteSiteDocument,
  getLoyaltyTierTable,
  getAdminLoyaltyTiers,
  upsertLoyaltyTier,
  deleteLoyaltyTier,
  getProductReviews,
  getProductStockQuantity,
  getProductWriteConflicts,
  getBestsellingProducts,
  getPublicProductVariants,
  getPublishedCatalogPage,
  getPublishedProductCount,
  getPublishedProductsByIds,
  searchPublishedCatalog,
  getPublishedRoutineBySlug,
  getRecommendedProducts,
  getRelatedProducts,
  getPublishedPosts,
  getPublishedPostBySlug,
  getMarketingSpendRows,
  getReviewEligibility,
  getRoutineForProduct,
  getSiteMedia,
  getSiteText,
  getStoreSettings,
  getStoreSettingValue,
  upsertStoreSetting,
  deleteStoreSetting,
  adjustStoreCredit,
  getStoreCreditLedger,
  getUserStoreCreditBalance,
  getUserById,
  getVisitorSessionIdByToken,
  getWishlistForUser,
  resolvePageviewSession,
  getWishlistWatchersForProduct,
  logAdminAction,
  findRecentCampaignSend,
  mergeGuestCartIntoUserCart,
  postSlugExists,
  postCategoryNameExists,
  recordLoginAttempt,
  // verify.mn phone verification (2026-09-05) -- see server/verifyMn.ts
  findUserByPhone,
  getPhoneVerificationSessionByVerifyMnId,
  resetPasswordViaPhoneSession,
  attachPhoneFromVerifiedSession,
  completeRegistrationViaPhoneSession,
  updatePhoneVerificationSessionStatus,
  removeWishlistItem,
  deleteSiteMedia,
  deleteSiteText,
  getUserAddresses,
  routineSlugExists,
  validateDiscountCode,
  variantSkuExists,
  setReviewApproval,
  setRoutineSteps,
  suspendUser,
  touchUserLastSignedIn,
  unsuspendUser,
  upsertSiteMedia,
  upsertSiteText,
  upsertMarketingSpend,
  updateAdminCategory,
  cancelOwnOrder,
  getOrderForTracking,
  getUsersForCampaignSend,
  refundOrder,
  getAdminProductDetail,
  getStoreCreditDrift,
  updateAdminOrder,
  updateAdminPost,
  updateAdminProduct,
  updateAdminProductVariant,
  updateAdminDiscountCode,
  updateAdminRoutine,
  updateAdminSitePromotion,
  updateAdminUserRole,
  updateAdminUserPhone,
  updateAdminIntegration,
  getRecentNotificationOutbox,
  updateUserLoyaltyAdjustment,
  updateCartItemQuantity,
  updateNotificationPreferences,
  updateUserAddress,
  updateUserAvatar,
  updateUserPreferences,
  updateUserProfile,
  deleteFaceEnrollment,
  getFaceAttempts,
  getFaceEnrollment,
  recordFaceAttempt,
  upsertFaceEnrollment,
} from "./db";
// Customer-content safety (2026-09-13): NSFW screen on avatar uploads and
// a multilingual abuse screen on review text -- both server-side.
import { classifyImageSafety, formatScores, IMAGE_SAFETY_REJECT_MESSAGE } from "./_core/imageSafety";
import { MODERATION_REJECT_MESSAGE, screenText } from "./_core/moderation";
import { canReplyToReview, createReviewReply, deleteAdminReviewReply, getAdminReviewReplies, toggleReviewLike, updateAdminReview, updateAdminReviewReply } from "./db";
// Admin face gate (2026-09-08) -- see server/faceAuth.ts.
import { clearFaceProofCookie, completeFaceVerification, hasValidFaceProof, isFaceGateEnabled, lockFaceSession, refreshFaceProof, startFaceVerification } from "./faceAuth";
import { FACE_DESCRIPTOR_LENGTH, FACE_DIAGNOSTIC_MAX, FACE_IDLE_TIMEOUT_MS, FACE_MODEL_VERSION, isAdminPanelRole, isValidFaceDescriptor } from "../shared/face-auth";
import { adminProcedure, anyStaffProcedure, catalogReadProcedure, contentReadProcedure, financeProcedure, lenientRateLimitedProcedure, marketingProcedure, moderateRateLimitedProcedure, ordersReadProcedure, phoneVerifyRateLimitedProcedure, protectedProcedure, publicProcedure, router, staffProcedure, strictRateLimitedProcedure, strictRateLimitedProtectedProcedure, usersReadProcedure, warehouseProcedure } from "./_core/trpc";
import { storagePing, storagePut, storagePutImageVariants } from "./storage";
import { IMAGE_MAX_DIMENSION, processUploadedImageVariants } from "./_core/imageProcessing";
import { createQPayInvoice, parseQPayInvoicePayload, getQPayAvailability } from "./qpay";
import { sendNtfyTest } from "./notifications";
import { notificationsRouter } from "./notificationsRouter";
import { inventoryRouter } from "./inventoryRouter";
import { getInventorySyncProvider, getInventorySyncStatus, runInventorySync, runPullSnapshot, setBranchExternalId } from "./integrations/inventorySync";
import { createStorepayLoan, getStorepayAvailability, normaliseMobileNumber, storepayPossibleAmount } from "./storepay";
// Registers the Smart Software adapter on import (side effect).
import "./integrations/smartSoftware";
import { assertImageSignature, imageContentTypes, processUploadedImageOrThrow } from "./_core/imageUpload";
import { INTEGRATION_PROVIDERS } from "../shared/integrations";
import { buildNotificationMessage, NOTIFICATION_GROUP_LABELS, NOTIFICATION_GROUPS, NTFY_TOPIC_FIELD } from "../shared/notification-events";
import { createNoOpVerificationSession, createVerificationSession, getSessionStatus, isNoOpSessionExpired, normalizePhoneForVerifyMn } from "./verifyMn";
import { getCategoryWriteViolation, getProductWriteViolation } from "./catalog-validation";
import { getAnalyticsReport, exportAnalyticsExcel, exportAnalyticsPdf, getAllCustomersForCampaign, getDashboardHighlights, getPreferenceSegmentBreakdown, getRecommendationCoverage, getUsersByLoyaltyTier, getUsersBySegment, type PreferenceSegmentField } from "./analytics";
import { siteMediaSlotKeys } from "../shared/site-media";
import { siteTextSlotKeys } from "../shared/site-text";
import { isRefundOwed } from "../shared/orders";
import { storeSettingKeys, getStoreSettingSlot, fillTemplate, tokensIn, type StoreSettingKey } from "../shared/store-settings";
import { formatMnt } from "@shared/format";

const slugSchema = z.string().trim().min(2).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.");
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

/**
 * `schema.partial()` for UPDATE endpoints, minus every `.default()`.
 *
 * 2026-09-11, found by server/inventory.integration.test.ts: in zod 4 a
 * `.default()` still fires inside `.partial()` when the key is omitted. So
 * every partial update silently wrote the create-time defaults for fields
 * it never mentioned -- moving a branch up the list (which sends only
 * sortOrder) also set isFulfillmentDefault=false, which turned off online
 * delivery if it was the fulfilment branch; editing a news post reset its
 * format to "standard"; reordering a featured brand re-activated it. The
 * posts schema had already been bitten once (see its categoryIds comment).
 * An update must only ever touch the fields it was given.
 */
function partialForUpdate<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const base = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : (field as z.ZodType);
    shape[key] = base.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<{ [K in keyof Shape]: z.ZodOptional<Shape[K] extends z.ZodDefault<infer Inner extends z.ZodType> ? Inner : Shape[K]> }>;
}
// Shared between profile.updatePreferences (what a shopper says about
// themselves) and the admin product form (what a product is tagged with) —
// see PREMIUM-FEATURES.md TIER 1. Same vocabulary on both sides is what
// makes "recommended for you" a plain intersection, not a lookup table.
const skinTypeSchema = z.enum(["dry", "oily", "combination", "sensitive", "normal"]).nullable().optional();
const skinConcernsSchema = z.string().trim().max(300).nullable().optional();
const interiorStyleSchema = z.string().trim().max(60).nullable().optional();
// Preference Profile v2 (2026-09-01) — same "shared between the customer
// quiz wizard and the admin product-tag form" convention as the schemas
// above; hairType/hairConcerns/fragrancePreference/wellnessInterests are
// used both ways, gender/primaryDistrict/skinRoutineComplexity/
// hasYoungChildren are shopper-only (no product mirror).
const genderSchema = z.enum(["male", "female", "other"]).nullable().optional();
const skinRoutineComplexitySchema = z.enum(["minimal", "moderate", "extensive"]).nullable().optional();
const hairTypeSchema = z.enum(["dry", "oily", "normal", "damaged", "color_treated"]).nullable().optional();
const hairConcernsSchema = z.string().trim().max(300).nullable().optional();
const fragrancePreferenceSchema = z.enum(["unscented", "light", "floral", "citrus"]).nullable().optional();
const wellnessInterestsSchema = z.string().trim().max(300).nullable().optional();
// Same shape checkout.createOrder already validates customerPhone with —
// reused here so profile.update and the address book accept exactly the
// same phone formats a delivery actually needs.
const phoneSchema = z.string().trim().min(6).max(40).regex(/^[0-9+()\-\s]{6,40}$/, "Утасны дугаараа зөв оруулна уу.").refine(value => value.replace(/\D/g, "").length >= 8, "Утасны дугаараа зөв оруулна уу.");
// Optional everywhere it's used (checkout/address book) -- see the schema
// comment on user_addresses.district in drizzle/schema.ts.
const districtSchema = z.enum(ubDistricts).nullable().optional();
const addressWriteSchema = z.object({
  label: z.string().trim().min(1).max(60),
  recipientName: z.string().trim().min(2).max(160),
  phone: phoneSchema,
  addressLine: z.string().trim().min(8).max(2_000),
  district: districtSchema,
  isDefault: z.boolean().optional(),
});

const productWriteSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(2).max(180),
  slug: slugSchema,
  brand: nullableText(120),
  shortDescription: nullableText(2_000),
  description: nullableText(20_000),
  priceMnt: z.number().int().min(0).max(100_000_000),
  compareAtPriceMnt: z.number().int().min(0).max(100_000_000).nullable().optional(),
  // Admin-only, optional -- see the schema comment on products.costMnt. Never
  // shown anywhere outside /admin, only ever used to compute profit/margin.
  costMnt: z.number().int().min(0).max(100_000_000).nullable().optional(),
  sku: z.string().trim().min(2).max(80),
  imageUrl: nullableText(1_000),
  galleryJson: nullableText(20_000),
  stockQuantity: z.number().int().min(0).max(1_000_000),
  isPublished: z.boolean(),
  skinType: skinTypeSchema,
  skinConcerns: skinConcernsSchema,
  interiorStyle: interiorStyleSchema,
  // Preference Profile v2 (2026-09-01) -- mirrors the matching fields on
  // users (see the schema.ts doc-comment on products.hairType).
  hairType: hairTypeSchema,
  hairConcerns: hairConcernsSchema,
  fragrancePreference: fragrancePreferenceSchema,
  wellnessInterests: wellnessInterestsSchema,
});

// Product variants -- PHASE 1, additive only (see drizzle/schema.ts).
const productVariantBaseSchema = z.object({
  productId: z.number().int().positive(),
  sku: z.string().trim().min(2).max(80),
  attributes: z.record(z.string().max(40), z.string().max(120)).nullable().optional(),
  priceMnt: z.number().int().min(0).max(100_000_000),
  compareAtPriceMnt: z.number().int().min(0).max(100_000_000).nullable().optional(),
  stockQuantity: z.number().int().min(0).max(1_000_000),
  imageUrl: nullableText(1_000),
  isDefault: z.boolean().optional(),
});
const productVariantWriteSchema = productVariantBaseSchema;
const productVariantUpdateSchema = partialForUpdate(productVariantBaseSchema).extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one variant field to update." },
);

const categoryWriteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only."),
  description: nullableText(2_000),
  imageUrl: nullableText(1_000),
  sortOrder: z.number().int().min(0).max(10_000),
  isActive: z.boolean(),
});

const productUpdateSchema = partialForUpdate(productWriteSchema).extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one product field to update." },
);

const categoryUpdateSchema = partialForUpdate(categoryWriteSchema).extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one category field to update." },
);

// 2026-09-07 (WordPress-parity admin editor rebuild): content max raised
// 30_000 -> 200_000 -- real formatted HTML (headings/lists/links/inline
// images) from TinyMCE runs far larger per character than the plain text the
// old textarea produced. postFormats mirrors WordPress's 8 built-in post
// formats (stored for visual fidelity with the reference screenshot; no
// template branches on it yet -- true of most real WP themes too).
const postFormats = ["standard", "aside", "image", "video", "audio", "quote", "link", "gallery"] as const;
const postWriteSchema = z.object({
  title: z.string().trim().min(3).max(220),
  slug: slugSchema,
  excerpt: nullableText(1_000),
  content: z.string().trim().min(10).max(200_000),
  coverImageUrl: nullableText(1_000),
  isPublished: z.boolean(),
  metaTitle: nullableText(70),
  metaDescription: nullableText(160),
  format: z.enum(postFormats).default("standard"),
  // No `.default([])` here: postUpdateSchema is `postWriteSchema.partial()`,
  // and a real bug (caught by server/posts.integration.test.ts) showed a
  // zod default still gets applied when a partial call simply omits the
  // key -- turning "I didn't mention categories" into "set categories to
  // empty" and silently wiping them on an update that only meant to change
  // tags. `.optional()` (no default) lets `attachPostTaxonomy` correctly
  // tell "omitted, leave alone" apart from "explicitly []", matching every
  // other field on this schema's partial-update semantics.
  categoryIds: z.array(z.number().int().positive()).max(20).optional(),
  tagNames: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  // When present and in the future, schedules the post rather than
  // publishing it immediately -- see getPublishedPosts/getPublishedPostBySlug's
  // `publishedAt <= NOW()` gate in server/db.ts for how this is enforced with
  // no cron/worker involved.
  publishAt: z.coerce.date().nullable().optional(),
});
const postUpdateSchema = partialForUpdate(postWriteSchema).extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one post field to update." },
);
const postCategoryWriteSchema = z.object({ name: z.string().trim().min(1).max(80) });
// NEWVISION.md §5 "Топ брэндүүд" -- brandName is validated server-side too
// (see createFeaturedBrand's caller below), but the real guarantee that it
// matches an existing products.brand value is the admin UI only offering a
// dropdown built from getDistinctRealBrands, never a free-text field.
const featuredBrandWriteSchema = z.object({
  brandName: z.string().trim().min(1).max(120),
  tagline: nullableText(300),
  photoUrl: nullableText(1_000),
  logoUrl: nullableText(1_000),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
const featuredBrandUpdateSchema = partialForUpdate(featuredBrandWriteSchema).extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one brand field to update." },
);
// "Controls everything" admin overhaul (2026-09-08, Phase J): `name` is
// what orders.pickupBranch stores verbatim (unchanged, free varchar) --
// see the schema comment on `branches` for why this stays a name, not an
// id, at the order-record level.
const branchWriteSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema,
  address: z.string().trim().min(4).max(2_000),
  phone: nullableText(40),
  mapUrl: nullableText(1_000),
  photoUrl: nullableText(1_000),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  isFulfillmentDefault: z.boolean().default(false),
  // 2026-09-11 (migration 0064) -- see the `branches` schema comment.
  kind: z.enum(["store", "warehouse"]).default("store"),
  countsTowardOnlineStock: z.boolean().default(true),
  lowStockThreshold: z.number().int().min(0).max(100_000).nullable().optional(),
});
const branchUpdateSchema = partialForUpdate(branchWriteSchema).extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one branch field to update." },
);

/**
 * 2026-09-11: branch CRUD is marketing's (address, phone, photo), but which
 * location online orders ship from, whether a location is a warehouse, and
 * whether its shelf counts as online stock decide what the website sells.
 * Those stay admin-only -- before this, marketing could re-point online
 * fulfilment with one click.
 */
function assertBranchStockFieldsAllowed(role: string, input: { isFulfillmentDefault?: boolean; kind?: string; countsTowardOnlineStock?: boolean; lowStockThreshold?: number | null }, creating: boolean) {
  if (role === "admin") return;
  const touches = creating
    ? input.isFulfillmentDefault === true || (input.kind !== undefined && input.kind !== "store") || input.countsTowardOnlineStock === false || (input.lowStockThreshold !== undefined && input.lowStockThreshold !== null)
    : input.isFulfillmentDefault !== undefined || input.kind !== undefined || input.countsTowardOnlineStock !== undefined || input.lowStockThreshold !== undefined;
  if (touches) throw new TRPCError({ code: "FORBIDDEN", message: "Онлайн захиалгын үндсэн салбар, агуулах, онлайн нөөц болон нөөцийн босгыг зөвхөн админ өөрчилнө." });
}
// PREMIUM-FEATURES.md TIER 4.
const routineWriteSchema = z.object({
  name: z.string().trim().min(2).max(180),
  slug: slugSchema,
  description: nullableText(2_000),
  discountPercent: z.number().int().min(0).max(100),
  isPublished: z.boolean(),
});
const routineUpdateSchema = partialForUpdate(routineWriteSchema).extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one routine field to update." },
);
const routineStepInputSchema = z.object({ productId: z.number().int().positive(), stepLabel: z.string().trim().min(1).max(120) });
// Marketing popup/banner (new-arrival, sale, store event) -- see sitePromotions in drizzle/schema.ts.
const promotionWriteSchema = z.object({
  isActive: z.boolean(),
  displayMode: z.enum(["popup", "banner"]),
  headline: z.string().trim().min(2).max(160),
  message: nullableText(1_000),
  imageUrl: nullableText(1_000),
  ctaLabel: nullableText(60),
  ctaUrl: nullableText(300),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});
const promotionUpdateSchema = partialForUpdate(promotionWriteSchema).extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one promotion field to update." },
);
// Manually-entered checkout discount code ("SALE10") -- see discountCodes in drizzle/schema.ts.
const discountCodeBaseSchema = z.object({
  code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, "Зөвхөн үсэг, тоо, - _ ашиглана."),
  type: z.enum(["percent", "fixed"]),
  percentValue: z.number().int().min(1).max(100).nullable().optional(),
  fixedAmountMnt: z.number().int().min(1).nullable().optional(),
  minSubtotalMnt: z.number().int().min(0),
  maxUses: z.number().int().min(1).nullable().optional(),
  // Audit 2026-09-09 (R1): per-customer cap; null = unlimited (see schema).
  maxUsesPerCustomer: z.number().int().min(1).max(1_000).nullable().optional(),
  isActive: z.boolean(),
  expiresAt: z.coerce.date().nullable().optional(),
});
const discountCodeWriteSchema = discountCodeBaseSchema.refine(
  value => (value.type === "percent" ? Boolean(value.percentValue) : Boolean(value.fixedAmountMnt)),
  { message: "percent төрөлд хувь, fixed төрөлд дүн заавал шаардлагатай.", path: ["percentValue"] },
);
const discountCodeUpdateSchema = partialForUpdate(discountCodeBaseSchema).extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one discount code field to update." },
);
const orderStatusSchema = z.enum(["pending", "confirmed", "packed", "out_for_delivery", "completed", "cancelled", "returned"]);
const orderUpdateSchema = z.object({
  id: z.number().int().positive(),
  status: orderStatusSchema.optional(),
  deliveryTrackingRef: nullableText(180),
  adminNote: nullableText(5_000),
}).refine(
  value => value.status !== undefined || value.deliveryTrackingRef !== undefined || value.adminNote !== undefined,
  { message: "Provide an order update." },
);

// 2026-09-08 (Admin overhaul, Phase A): 3 -> 6 roles, see drizzle/schema.ts's
// `role` column comment and server/_core/trpc.ts for what each one can do.
const staffRoleSchema = z.enum(["user", "staff", "finance", "marketing", "warehouse", "admin"]);
const siteMediaSlotSchema = z.enum(siteMediaSlotKeys);
const siteTextSlotSchema = z.enum(siteTextSlotKeys);
const storeSettingKeySchema = z.enum(storeSettingKeys);
const legalDocumentKeySchema = z.enum(legalDocumentKeys);
// A syntactically valid but unusable scrypt hash (correct salt/hash lengths,
// see server/_core/password.ts), used to run `verifyPassword` through its
// full computation even when no account matches the submitted phone number.
// Without this, a login attempt for a real account pays for a scrypt
// derivation while one for a nonexistent phone returns almost instantly —
// an attacker can use that timing gap alone to enumerate registered phone
// numbers without ever guessing a password.
const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

// Called right after auth.login/auth.register issue a session: if the
// browser was shopping as a guest, fold that cart into the now-known
// account's cart and stop treating the browser as a guest.
async function mergeGuestCartAndClearCookie(ctx: TrpcContext, userId: number) {
  const guestToken = currentGuestCartToken(ctx);
  if (!guestToken) return;
  try {
    await mergeGuestCartIntoUserCart(guestToken, userId);
  } catch (error) {
    console.error("[auth] Failed to merge guest cart into user cart", error);
  }
  ctx.res.clearCookie(GUEST_CART_COOKIE_NAME, { ...getGuestCartCookieOptions(ctx.req), maxAge: -1 });
}

function currentGuestCartToken(ctx: TrpcContext): string | undefined {
  const cookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
  return cookies[GUEST_CART_COOKIE_NAME];
}

// Used by cart/checkout *queries*: never issues a new guest-cart cookie (a
// page load that never adds anything shouldn't set one), so an anonymous
// shopper with no cookie yet simply has no cart (null) rather than one being
// silently created.
function resolveCartOwnerForRead(ctx: TrpcContext): CartOwner | null {
  if (ctx.user) return { userId: ctx.user.id };
  const guestToken = currentGuestCartToken(ctx);
  return guestToken ? { guestToken } : null;
}

// Used by cart/checkout *mutations*: mints and sets a fresh guest-cart
// cookie the first time an anonymous shopper actually adds something.
function resolveCartOwnerForWrite(ctx: TrpcContext): CartOwner {
  if (ctx.user) return { userId: ctx.user.id };
  const existingToken = currentGuestCartToken(ctx);
  if (existingToken) return { guestToken: existingToken };
  const guestToken = randomBytes(24).toString("base64url");
  ctx.res.cookie(GUEST_CART_COOKIE_NAME, guestToken, getGuestCartCookieOptions(ctx.req));
  return { guestToken };
}


// ROADMAP.md TIER 2: order confirmation + status-change notifications.
// Both are best-effort (see the try/catch at each call site) — a Brevo
// hiccup should never fail or roll back a real order.
//
// "Controls everything" admin overhaul (2026-09-08, Phase C): the prose
// itself now comes from store_settings (admin-editable via "Дэлгүүрийн
// тохиргоо" > "Мессежийн загвар"), via getStoreSettingValue's usual DB-
// override-with-code-fallback contract -- shared/store-settings.ts's
// fallbackValue for each key IS today's exact wording, so an unconfigured
// key sends byte-for-byte what this file used to hardcode. Only mapped
// here: which settingKey backs which order status -- "pending" has
// deliberately no entry (no transition to announce for the initial state).
const orderStatusMessageKeys: Partial<Record<string, StoreSettingKey>> = {
  confirmed: "email-order-status-confirmed",
  packed: "email-order-status-packed",
  out_for_delivery: "email-order-status-out_for_delivery",
  completed: "email-order-status-completed",
  cancelled: "email-order-status-cancelled",
  returned: "email-order-status-returned",
};

async function sendOrderConfirmationEmail(order: { orderNumber: string; customerEmail: string | null; customerName: string; totalMnt: number; deliveryMethod: string; deliveryAddress: string | null; pickupBranch: string | null; items: { name: string; quantity: number; priceMnt: number; attributesJson?: string | null }[]; discountMnt?: number; routineName?: string | null; couponCode?: string | null; couponDiscountMnt?: number; loyaltyDiscountMnt?: number; appliedLoyaltyTierName?: string | null; storeCreditAppliedMnt?: number }) {
  if (!order.customerEmail) return;
  const itemLines = order.items.map(item => {
    const attributes = formatVariantAttributes(item.attributesJson);
    return `- ${item.name}${attributes ? ` (${attributes})` : ""} × ${item.quantity} (${formatMnt(item.priceMnt * item.quantity)})`;
  }).join("\n");
  const deliveryLine = order.deliveryMethod === "store_pickup" ? `Хүргэлт: ${order.pickupBranch} салбараас өөрөө авах` : `Хүргэлт: ${order.deliveryAddress ?? "Улаанбаатар хот дотор"}`;
  // PREMIUM-FEATURES.md TIER 4/5 + coupon codes: only mentioned when actually applied.
  const routineDiscountLine = order.discountMnt && order.discountMnt > 0 ? `\n"${order.routineName}" routine хямдрал: -${formatMnt(order.discountMnt)}` : "";
  const couponDiscountLine = order.couponDiscountMnt && order.couponDiscountMnt > 0 ? `\n"${order.couponCode}" хямдралын код: -${formatMnt(order.couponDiscountMnt)}` : "";
  const loyaltyDiscountLine = order.loyaltyDiscountMnt && order.loyaltyDiscountMnt > 0 ? `\n"${order.appliedLoyaltyTierName}" гишүүнчлэлийн хямдрал: -${formatMnt(order.loyaltyDiscountMnt)}` : "";
  // "Controls everything" admin overhaul (2026-09-08, Phase I): same
  // "only mentioned when actually applied" pattern as the 3 discount lines
  // above -- cash-equivalent, so labeled distinctly from a percentage discount.
  const storeCreditLine = order.storeCreditAppliedMnt && order.storeCreditAppliedMnt > 0 ? `\nДэлгүүрийн зээл ашигласан: -${formatMnt(order.storeCreditAppliedMnt)}` : "";
  const closingLine = await getStoreSettingValue("email-order-confirmation-closing");
  await sendAccountEmail({
    to: order.customerEmail,
    subject: fillTemplate(await getStoreSettingValue("email-subject-order-confirmation"), { "{захиалга}": order.orderNumber }),
    content: `Сайн байна уу, ${order.customerName}!\n\nТаны ${order.orderNumber} дугаартай захиалгыг хүлээн авлаа:\n\n${itemLines}${routineDiscountLine}${couponDiscountLine}${loyaltyDiscountLine}${storeCreditLine}\n\nНийт дүн: ${formatMnt(order.totalMnt)}\n${deliveryLine}\n\n${closingLine}`,
  });
}

async function sendOrderStatusUpdateEmail(order: { orderNumber: string; customerEmail: string | null; customerName: string; status: string; paymentStatus: string; deliveryTrackingRef: string | null }) {
  if (!order.customerEmail) return;
  const messageKey = orderStatusMessageKeys[order.status];
  if (!messageKey) return; // "pending" (initial state) has no transition to announce.
  const message = await getStoreSettingValue(messageKey);
  const trackingLine = order.deliveryTrackingRef ? `\nХүргэлтийн дугаар: ${order.deliveryTrackingRef}` : "";
  // Audit 2026-09-09 (R2): a cancelled order whose payment was already
  // collected tells the customer the money is coming back, instead of a
  // bare "cancelled" that reads like the payment vanished.
  const refundLine = isRefundOwed(order) ? "\n\nТаны төлсөн төлбөрийг бүрэн буцаан олгоно. Манай ажилтан буцаан олголтын талаар тантай холбогдоно." : "";
  await sendAccountEmail({
    to: order.customerEmail,
    subject: fillTemplate(await getStoreSettingValue("email-subject-order-status"), { "{захиалга}": order.orderNumber }),
    content: `Сайн байна уу, ${order.customerName}!\n\n${message}${trackingLine}${refundLine}\n\nЗахиалгын дугаар: ${order.orderNumber}`,
  });
}

// assertImageSignature / processUploadedImageOrThrow moved to
// server/_core/imageUpload.ts (2026-09-11) so the inventory router can
// accept supplier-invoice photos too.

/** Same BAD_REQUEST translation as processUploadedImageOrThrow, for the WebP + grid-derivative path. */
async function processUploadedImageVariantsOrThrow(buffer: Buffer, maxDimension: number) {
  try {
    return await processUploadedImageVariants(buffer, maxDimension);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Зургийг уншиж чадсангүй. Файл гэмтсэн эсвэл дэмжигдээгүй байж магадгүй." });
  }
}

async function validateProductWrite(input: { categoryId?: number; slug?: string; sku?: string; id?: number }) {
  const categoryFound = input.categoryId === undefined ? null : await categoryExists(input.categoryId);
  const conflicts = input.slug !== undefined || input.sku !== undefined ? await getProductWriteConflicts({ slug: input.slug, sku: input.sku, excludeId: input.id }) : [];
  const violation = getProductWriteViolation(input, categoryFound, conflicts);
  if (violation) throw new TRPCError(violation);
}

// Admin overhaul (2026-09-08, Phase H): bulk CSV import. "" (present but
// blank) vs undefined (column not in this row at all) matter differently on
// an UPDATE row -- undefined means "leave the existing value alone" (same
// partial-update semantics productUpdateSchema already has), while "" means
// "clear this field to null." Never conflated.
function csvCellToNullable(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
function csvCellToInt(value: string, fieldName: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) throw new Error(`${fieldName}: "${value}" бүхэл тоо биш байна.`);
  return parsed;
}
const CSV_TRUTHY = new Set(["true", "1", "yes", "тийм", "нийтлэгдсэн", "нийтэлсэн"]);
function csvCellToBoolean(value: string): boolean {
  return CSV_TRUTHY.has(value.trim().toLowerCase());
}

export type CsvImportRowOutcome = { row: number; sku: string; outcome: "created" | "updated" | "skipped" | "error"; message: string | null };

// Every row runs through the exact same productWriteSchema/
// productUpdateSchema + validateProductWrite pipeline the single-product
// composer's createProduct/updateProduct above already use -- not a second,
// parallel copy of that validation -- so a CSV-imported product can never
// end up in a state the one-at-a-time editor wouldn't also allow. Category
// is resolved by case-insensitive name match against the live category
// list (an admin/warehouse user types a real category name, not an
// internal numeric id); an unmatched name is a row error, never a silent
// default category. Every row is wrapped in its own try/catch so one bad
// row (an unknown category, an out-of-range price, a duplicate SKU) never
// aborts the rest of the batch. dryRun runs this exact same function --
// the only difference is whether createAdminProduct/updateAdminProduct are
// actually called at the end -- so a preview can never disagree with what
// committing it actually does.
async function importProductsCsvRows(
  rows: Record<string, string>[],
  options: { allowUpdateExisting: boolean; dryRun: boolean; actorUserId: number; actorRole: string },
): Promise<CsvImportRowOutcome[]> {
  const categories = await getAdminCategories();
  const categoryIdByName = new Map(categories.map(category => [category.name.trim().toLowerCase(), category.id]));
  const seenSkusInBatch = new Set<string>();
  const results: CsvImportRowOutcome[] = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const sku = (row.sku ?? "").trim();
    try {
      if (!sku) throw new Error("SKU шаардлагатай.");
      if (seenSkusInBatch.has(sku)) throw new Error("Энэ SKU файлын дотор давхардсан байна.");
      seenSkusInBatch.add(sku);

      const existing = await findProductBySku(sku);
      if (existing && !options.allowUpdateExisting) {
        results.push({ row: index, sku, outcome: "skipped", message: "Энэ SKU-тай бараа аль хэдийн байна (шинэчлэхийг энэ импортод зөвшөөрөөгүй)." });
        continue;
      }

      const categoryNameCell = row.category?.trim();
      let categoryId: number | undefined;
      if (categoryNameCell) {
        const matched = categoryIdByName.get(categoryNameCell.toLowerCase());
        if (matched === undefined) throw new Error(`Ангилал олдсонгүй: "${categoryNameCell}"`);
        categoryId = matched;
      }

      const nameCell = row.name?.trim();
      const candidate: Record<string, unknown> = {
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(nameCell ? { name: nameCell } : {}),
        sku,
        slug: row.slug?.trim() || (nameCell ? slugify(nameCell) : undefined),
        brand: csvCellToNullable(row.brand),
        shortDescription: csvCellToNullable(row.shortDescription),
        description: csvCellToNullable(row.description),
        imageUrl: csvCellToNullable(row.imageUrl),
        skinType: csvCellToNullable(row.skinType),
        skinConcerns: csvCellToNullable(row.skinConcerns),
        interiorStyle: csvCellToNullable(row.interiorStyle),
        hairType: csvCellToNullable(row.hairType),
        hairConcerns: csvCellToNullable(row.hairConcerns),
        fragrancePreference: csvCellToNullable(row.fragrancePreference),
        wellnessInterests: csvCellToNullable(row.wellnessInterests),
      };
      if (row.priceMnt?.trim()) candidate.priceMnt = csvCellToInt(row.priceMnt, "priceMnt");
      if (row.compareAtPriceMnt !== undefined) candidate.compareAtPriceMnt = row.compareAtPriceMnt.trim() === "" ? null : csvCellToInt(row.compareAtPriceMnt, "compareAtPriceMnt");
      if (row.costMnt !== undefined) candidate.costMnt = row.costMnt.trim() === "" ? null : csvCellToInt(row.costMnt, "costMnt");
      if (row.stockQuantity?.trim()) candidate.stockQuantity = csvCellToInt(row.stockQuantity, "stockQuantity");
      if (row.isPublished?.trim()) candidate.isPublished = csvCellToBoolean(row.isPublished);
      // costMnt is admin-only, same rule as the single-product composer.
      if (options.actorRole !== "admin") delete candidate.costMnt;

      if (existing) {
        const parsed = productUpdateSchema.parse({ id: existing.id, ...candidate });
        await validateProductWrite(parsed);
        if (!options.dryRun) {
          const product = await updateAdminProduct(parsed);
          await logAdminAction({ actorUserId: options.actorUserId, action: "product.updated", entityType: "product", entityId: product.id, metadata: { slug: product.slug, source: "csv_import" } });
        }
        results.push({ row: index, sku, outcome: "updated", message: null });
      } else {
        if (candidate.isPublished === undefined) candidate.isPublished = false;
        const parsed = productWriteSchema.parse(candidate);
        await validateProductWrite(parsed);
        if (!options.dryRun) {
          const product = await createAdminProduct(parsed);
          await logAdminAction({ actorUserId: options.actorUserId, action: "product.created", entityType: "product", entityId: product.id, metadata: { slug: product.slug, source: "csv_import" } });
        }
        results.push({ row: index, sku, outcome: "created", message: null });
      }
    } catch (error) {
      const message = error instanceof z.ZodError
        ? error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")
        : error instanceof Error ? error.message : "Тодорхойгүй алдаа.";
      results.push({ row: index, sku: sku || `${index + 1}-р мөр`, outcome: "error", message });
    }
  }
  return results;
}

async function validateCategoryWrite(input: { slug?: string; id?: number }) {
  const conflicts = input.slug === undefined ? [] : await getCategoryWriteConflicts({ slug: input.slug, excludeId: input.id });
  const violation = getCategoryWriteViolation(input.slug, conflicts);
  if (violation) throw new TRPCError(violation);
}

async function validatePostSlug(slug?: string, id?: number) {
  if (slug && await postSlugExists(slug, id)) {
    throw new TRPCError({ code: "CONFLICT", message: "This post URL slug is already in use." });
  }
}

async function validatePostCategoryName(name: string) {
  if (await postCategoryNameExists(name)) {
    throw new TRPCError({ code: "CONFLICT", message: "Энэ нэртэй ангилал аль хэдийн байна." });
  }
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  notifications: notificationsRouter,
  inventory: inventoryRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // 2026-09-06: there is no more single-step auth.register. Tom initially
    // asked for phone+password registration with OPTIONAL verification
    // ("only contacting admin for recovery is okay") -- then, after
    // literally seeing an account get created with his wife's phone number
    // with zero proof of ownership, explicitly reversed that: registration
    // now REQUIRES a real, live-confirmed verify.mn SMS reply before any
    // account exists. See auth.startPhoneVerification (purpose:"register",
    // now reachable with no session) + auth.completeRegistration below,
    // which is what actually creates the account once verify.mn confirms.
    //
    // Login is phone+password (unchanged) -- findUserByPhone's flexible digits-only-right-8
    // match means however the shopper happens to type their number (spaces,
    // dashes, +976 or not) still resolves to their one account.
    login: strictRateLimitedProcedure
      .input(z.object({
        phone: phoneSchema,
        password: z.string().min(1).max(200),
      }))
      .mutation(async ({ ctx, input }) => {
        const normalizedPhone = normalizePhoneForVerifyMn(input.phone);
        const user = normalizedPhone ? await findUserByPhone(normalizedPhone) : undefined;
        // Always run the full password check, even for a nonexistent user
        // (against a dummy hash) — see DUMMY_PASSWORD_HASH above.
        const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
        const ipAddress = ctx.req.ip || ctx.req.socket.remoteAddress || null;
        const logAttempt = (success: boolean, reason?: string) => recordLoginAttempt({ email: input.phone, userId: user?.id ?? null, success, reason, ipAddress });

        if (!user || !valid) {
          await logAttempt(false, "invalid_credentials");
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Утасны дугаар эсвэл нууц үг буруу байна." });
        }
        if (user.suspendedAt) {
          await logAttempt(false, "suspended");
          throw new TRPCError({ code: "FORBIDDEN", message: "Таны эрх түр хаагдсан байна. Дэлгүүрийн админтай холбогдоно уу." });
        }
        await touchUserLastSignedIn(user.id);
        await logAttempt(true);
        const token = await signSessionToken(user.id, user.sessionVersion);
        ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));
        await mergeGuestCartAndClearCookie(ctx, user.id);
        const { passwordHash: _omit, ...safeUser } = user;
        return safeUser;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      // Admin face gate (2026-09-08): the face-proof cookie MUST die with the
      // session. Without this it outlives logout for its full 8-hour window,
      // so signing out and straight back in walked into /admin with no face
      // check at all -- exactly the "every time someone logs in" requirement
      // this gate exists to enforce. Found by Tom testing precisely that.
      clearFaceProofCookie(ctx.req, ctx.res);
      return {
        success: true,
      } as const;
    }),
    // There is no refresh-token rotation yet (sessions are still a single
    // 365-day JWT), so this is the stand-in: it invalidates every
    // already-issued token for the account, not just the current cookie.
    logoutAllDevices: protectedProcedure.mutation(async ({ ctx }) => {
      await bumpUserSessionVersion(ctx.user.id);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    // verify.mn phone verification (2026-09-05) -- the ONLY password-reset
    // method now ("we do not need brevo at all" -- the old email-code
    // requestPasswordReset/resetPassword pair is gone). purpose:"register" also lets an
    // already-logged-in user attach+verify a phone number, optionally (see
    // Login.tsx) -- never a blocking requirement to sign up, since each real
    // verification costs the shopper 150₮ via their own mobile operator.
    // 2026-09-06 (Tom, explicit, after seeing an unverified registration
    // accept someone else's phone number: "ehneriinhee utasiig hiigeed
    // burtguulsen chine shuud burtgegdej baina!! verify.mn geed ajilahgui
    // baina" -- reversing the earlier "optional at signup" call): "register"
    // purpose now works with NO session too (an anonymous shopper about to
    // create an account, not just an already-logged-in one attaching a
    // phone afterward) -- see auth.completeRegistration below for how a
    // no-ctx.user session actually finishes.
    startPhoneVerification: phoneVerifyRateLimitedProcedure
      .input(z.object({ phone: phoneSchema, purpose: z.enum(["register", "password_reset"]) }))
      .mutation(async ({ ctx, input }) => {
        let userId: number | null;
        if (input.purpose === "register") {
          // A phone already tied to an account can't start a fresh register
          // session -- unlike password_reset below, this is NOT an
          // anti-enumeration case: telling a registrant "this number is
          // already registered, sign in instead" up front is completely
          // ordinary signup UX, not a privacy leak, and saves them a real
          // 150₮ SMS for a session that could never complete anyway.
          const normalizedPhone = normalizePhoneForVerifyMn(input.phone);
          const existing = normalizedPhone ? await findUserByPhone(normalizedPhone) : undefined;
          if (existing && existing.id !== ctx.user?.id) {
            throw new TRPCError({ code: "CONFLICT", message: "Энэ утасны дугаараар бүртгэл үүссэн байна. Нэвтэрнэ үү." });
          }
          userId = ctx.user?.id ?? null;
        } else {
          // password_reset: resolve the account by phone, but never let the
          // response reveal whether a match was found -- same
          // anti-enumeration discipline requestPasswordReset already uses
          // for email above.
          const matched = await findUserByPhone(normalizePhoneForVerifyMn(input.phone) ?? "");
          userId = matched?.id ?? null;
        }
        if (input.purpose === "password_reset" && !userId) {
          // Deliberately never calls verify.mn here: doing so would send a
          // real, 150₮-to-them SMS to whatever phone number was typed in,
          // even though it belongs to nobody with an account here — an
          // innocent third party, not just a wasted request. Returns a fake
          // session that looks and behaves EXACTLY like a real one (same
          // instruction shape, same 300s pending-then-expired lifecycle —
          // see createNoOpVerificationSession's own comment for why this
          // matters beyond just the UI) that can simply never become verified.
          return createNoOpVerificationSession(input.phone);
        }
        try {
          return await createVerificationSession({ phone: input.phone, purpose: input.purpose, userId });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Баталгаажуулах SMS илгээж чадсангүй." });
        }
      }),
    // publicProcedure, not rate-limit-tiered beyond the blanket API cap:
    // polled every 3s by the client (same pattern as payments.qpayStatus /
    // Checkout.tsx's refetchInterval) and never triggers a new SMS itself.
    phoneVerificationStatus: publicProcedure
      .input(z.object({ sessionId: z.string().trim().min(1).max(80) }))
      .query(async ({ input }) => {
        if (input.sessionId.startsWith("noop:")) return { status: isNoOpSessionExpired(input.sessionId) ? ("expired" as const) : ("pending" as const) };
        const session = await getPhoneVerificationSessionByVerifyMnId(input.sessionId);
        if (!session) return { status: "expired" as const };
        if (session.consumedAt) return { status: "verified" as const };
        if (session.expiresAt.getTime() <= Date.now()) return { status: "expired" as const };
        try {
          const live = await getSessionStatus(session.verifyMnSessionId);
          const mapped = live.sessionStatus === "VERIFIED" ? ("verified" as const) : live.sessionStatus === "EXPIRED" ? ("expired" as const) : ("pending" as const);
          return { status: mapped };
        } catch (error) {
          console.error("[VerifyMn] Status poll failed", error);
          return { status: "pending" as const };
        }
      }),
    resetPasswordViaPhone: strictRateLimitedProcedure
      .input(z.object({ sessionId: z.string().trim().min(1).max(80), password: z.string().min(8).max(200) }))
      .mutation(async ({ input }) => {
        const session = await getPhoneVerificationSessionByVerifyMnId(input.sessionId);
        if (!session) throw new TRPCError({ code: "BAD_REQUEST", message: "Баталгаажуулалт олдсонгүй." });
        // Always re-check verify.mn's LIVE status right before spending the
        // session — never trust the cached status column alone here.
        try {
          const live = await getSessionStatus(session.verifyMnSessionId);
          await updatePhoneVerificationSessionStatus(session.id, live.sessionStatus === "VERIFIED" ? "verified" : live.sessionStatus === "EXPIRED" ? "expired" : "pending");
          if (live.sessionStatus !== "VERIFIED") throw new Error("Утасны дугаараа эхлээд баталгаажуулна уу.");
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Баталгаажуулж чадсангүй." });
        }
        const passwordHash = await hashPassword(input.password);
        try {
          await resetPasswordViaPhoneSession({ sessionId: session.id, passwordHash });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Нууц үг сэргээж чадсангүй." });
        }
        return { success: true } as const;
      }),
    // 2026-09-06: the actual signup mutation now -- there is no more
    // single-step auth.register. A phone must be live-verified via
    // startPhoneVerification/phoneVerificationStatus FIRST (no account
    // exists yet at that point, hence no ctx.user requirement here either),
    // and this is what turns that verified session into a real account,
    // exactly the same "re-check verify.mn's LIVE status, never trust the
    // cached column alone" discipline as resetPasswordViaPhone above.
    completeRegistration: strictRateLimitedProcedure
      .input(z.object({ sessionId: z.string().trim().min(1).max(80), password: z.string().min(8).max(200), name: z.string().trim().min(1).max(160).optional() }))
      .mutation(async ({ ctx, input }) => {
        const session = await getPhoneVerificationSessionByVerifyMnId(input.sessionId);
        if (!session) throw new TRPCError({ code: "BAD_REQUEST", message: "Баталгаажуулалт олдсонгүй." });
        try {
          const live = await getSessionStatus(session.verifyMnSessionId);
          await updatePhoneVerificationSessionStatus(session.id, live.sessionStatus === "VERIFIED" ? "verified" : live.sessionStatus === "EXPIRED" ? "expired" : "pending");
          if (live.sessionStatus !== "VERIFIED") throw new Error("Утасны дугаараа эхлээд баталгаажуулна уу.");
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Баталгаажуулж чадсангүй." });
        }
        const passwordHash = await hashPassword(input.password);
        let user;
        try {
          user = await completeRegistrationViaPhoneSession({ sessionId: session.id, passwordHash, name: input.name ?? null });
        } catch (error) {
          throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Бүртгэл үүсгэж чадсангүй." });
        }
        await touchUserLastSignedIn(user.id);
        const token = await signSessionToken(user.id, user.sessionVersion);
        ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));
        await mergeGuestCartAndClearCookie(ctx, user.id);
        const { passwordHash: _omit, ...safeUser } = user;
        return safeUser;
      }),
    // register-flow only: attaches+verifies a phone for an already-logged-in
    // user (see startPhoneVerification's purpose:"register" branch above).
    attachPhoneViaVerification: strictRateLimitedProtectedProcedure
      .input(z.object({ sessionId: z.string().trim().min(1).max(80) }))
      .mutation(async ({ input }) => {
        const session = await getPhoneVerificationSessionByVerifyMnId(input.sessionId);
        if (!session) throw new TRPCError({ code: "BAD_REQUEST", message: "Баталгаажуулалт олдсонгүй." });
        try {
          const live = await getSessionStatus(session.verifyMnSessionId);
          await updatePhoneVerificationSessionStatus(session.id, live.sessionStatus === "VERIFIED" ? "verified" : live.sessionStatus === "EXPIRED" ? "expired" : "pending");
          if (live.sessionStatus !== "VERIFIED") throw new Error("Утасны дугаараа эхлээд баталгаажуулна уу.");
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Баталгаажуулж чадсангүй." });
        }
        try {
          await attachPhoneFromVerifiedSession({ sessionId: session.id });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Утасны дугаар хадгалж чадсангүй." });
        }
        return { success: true } as const;
      }),
  }),
  catalog: router({
    // Frontend performance audit (2026-09-02): used to take no input and
    // return the entire published catalog for Shop.tsx to filter/sort/
    // paginate in the browser -- see getPublishedCatalogPage's own comment
    // for why that was a real cost on this audience's actual mobile
    // network conditions, not a cosmetic nitpick. Every field here is
    // optional and defaults sensibly (see getPublishedCatalogPage), so a
    // bare `catalog.list.useQuery()` (e.g. an `invalidate()` call
    // elsewhere) still behaves like the old unfiltered first-page fetch.
    list: publicProcedure
      .input(z.object({
        search: z.string().trim().max(120).optional(),
        category: z.string().trim().max(120).optional(),
        brand: z.string().trim().max(120).optional(),
        skinType: z.enum(["dry", "oily", "combination", "sensitive", "normal", "all"]).optional(),
        // NEWVISION.md §14 (Phase 2): price-range facet, alongside category/
        // brand/skinType above. int() + nonnegative() since priceMnt is
        // always a whole-tugrik integer in this catalog.
        minPriceMnt: z.number().int().nonnegative().optional(),
        maxPriceMnt: z.number().int().nonnegative().optional(),
        inStockOnly: z.boolean().optional(),
        sort: z.enum(["featured", "price-low", "price-high", "name-asc"]).optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
      }).optional())
      .query(({ input }) => getPublishedCatalogPage(input ?? {})),
    // Backs Shop.tsx's "Таны сүүлд үзсэн" rail -- see
    // getPublishedProductsByIds's own comment for why this exists
    // separately from catalog.list now that catalog.list no longer ships
    // the full catalog for the client to resolve arbitrary ids against.
    byIds: publicProcedure.input(z.object({ ids: z.array(z.number().int().positive()).max(12) })).query(({ input }) => getPublishedProductsByIds(input.ids)),
    // Server-side search (ROADMAP.md TIER 2) — a 2+ character query returns
    // matches from the FULLTEXT index instead of the client filtering the
    // full catalog.list payload. See searchPublishedCatalog for the exact
    // matching behavior.
    search: publicProcedure.input(z.object({ query: z.string().trim().min(2).max(120) })).query(({ input }) => searchPublishedCatalog(input.query)),
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(200) })).query(({ input }) => getProductBySlug(input.slug)),
    // Barcode scanning (2026-09-11). publicProcedure because the whole
    // point is a shopper standing in the shop scanning the box in their
    // hand -- there is no account involved, and it exposes nothing that
    // the product page itself does not already show to guests.
    // Returns null (not a 404) for an unknown or unpublished code so the
    // caller can say "this product is not on the site" instead of throwing.
    bySku: publicProcedure
      .input(z.object({ sku: z.string().trim().min(1).max(MAX_BARCODE_LENGTH * 2) }))
      .query(({ input }) => {
        const code = normaliseBarcode(input.sku);
        if (!looksLikeBarcode(code)) return null;
        return getPublishedProductBySku(code);
      }),
    // Preference Profile v2 (2026-09-01): "recommended for you" is now
    // public, not protected — getRecommendedProducts always returns a
    // bestseller-backed fallback for a guest (ctx.user is undefined here)
    // or a shopper with no preferences/history yet, so the section is
    // never silently hidden the way it was under TIER 1's original
    // protected-only, empty-array-if-no-preferences version.
    // personalOnly (2026-09-12): Home's rail passes it so a signed-in
    // shopper with nothing on file sees no rail at all, rather than
    // bestsellers under a heading addressed to them personally. /shop calls
    // this without it and keeps the bestseller-backed fallback.
    recommended: publicProcedure
      .input(z.object({ personalOnly: z.boolean().optional() }).optional())
      .query(({ ctx, input }) => getRecommendedProducts(ctx.user?.id ?? null, 8, input?.personalOnly ?? false)),
    // Preference Profile v2 (2026-09-01): ProductDetail's related-products
    // rail -- product-to-product tag overlap, no user/auth concept at all
    // (see getRelatedProducts), so this is always public.
    related: publicProcedure.input(z.object({ productId: z.number().int().positive() })).query(({ input }) => getRelatedProducts(input.productId)),
    // Homepage "Их зарагддаг бараа" rail — real paid-order history, not a
    // manually curated list. See getBestsellingProducts.
    bestsellers: publicProcedure.query(() => getBestsellingProducts(8)),
    // 2026-09-04 cohesion audit: backs the homepage's "800+" claim (hero
    // badge, category section, why-choose-us card) from one real COUNT(*)
    // instead of 3 independently hardcoded copies that could drift from
    // each other and from the real catalog size. See
    // getPublishedProductCount's own comment.
    publishedCount: publicProcedure.query(() => getPublishedProductCount()),
    // PHASE 2 of product variants: powers the ProductDetail/QuickView
    // picker. Only rendered client-side when this returns more than one row
    // — a single-variant product (the common case) looks exactly as it did
    // before variants existed.
    variants: publicProcedure.input(z.object({ productId: z.number().int().positive() })).query(({ input }) => getPublicProductVariants(input.productId)),
    // NEWVISION.md §5: real, admin-curated "Топ брэндүүд" tiles.
    featuredBrands: publicProcedure.query(() => getFeaturedBrands()),
    // 2026-09-10: backs /brands, the "View Full Brand List" destination.
    // Every real catalogue brand, not just the curated tiles -- see
    // getBrandDirectory's own comment for why.
    brandDirectory: publicProcedure.query(() => getBrandDirectory()),
  }),
  // PREMIUM-FEATURES.md TIER 5: cumulative-spend loyalty tiers (mirrors
  // Tom's Smart POS in-store membership card — see shared/loyalty.ts).
  loyalty: router({
    myStatus: protectedProcedure.query(({ ctx }) => getUserLoyaltyStatus(ctx.user.id)),
  }),
  // PREMIUM-FEATURES.md TIER 4: Routine Builder & Bundles.
  routines: router({
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(200) })).query(({ input }) => getPublishedRoutineBySlug(input.slug)),
    forProduct: publicProcedure.input(z.object({ productId: z.number().int().positive() })).query(({ input }) => getRoutineForProduct(input.productId)),
  }),
  // Site-wide marketing popup/banner -- one admin-editable message, scheduled
  // and toggled from the admin panel. See sitePromotions in drizzle/schema.ts.
  promotions: router({
    active: publicProcedure.query(() => getActiveSitePromotion()),
  }),
  // PREMIUM-FEATURES.md TIER 2: verified-purchase reviews & ratings.
  reviews: router({
    list: publicProcedure.input(z.object({ productId: z.number().int().positive() })).query(({ ctx, input }) => getProductReviews(input.productId, ctx.user?.id ?? null)),
    // Threaded conversation (2026-09-13): replies and likes.
    reply: strictRateLimitedProtectedProcedure
      .input(z.object({ reviewId: z.number().int().positive(), body: z.string().trim().min(1).max(2_000) }))
      .mutation(async ({ ctx, input }) => {
        const permission = await canReplyToReview(ctx.user.id, ctx.user.role, input.reviewId);
        if (!permission.ok) throw new TRPCError({ code: "FORBIDDEN", message: permission.reason });
        const verdict = await screenText(input.body);
        if (!verdict.allowed) {
          console.warn(`[moderation] reply rejected user=${ctx.user.id} review=${input.reviewId} category=${verdict.category} source=${verdict.source}`);
          throw new TRPCError({ code: "BAD_REQUEST", message: MODERATION_REJECT_MESSAGE });
        }
        return createReviewReply({ reviewId: input.reviewId, userId: ctx.user.id, body: input.body });
      }),
    like: protectedProcedure
      .input(z.object({ reviewId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await toggleReviewLike(input.reviewId, ctx.user.id);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Алдаа гарлаа." });
        }
      }),
    // NEWVISION.md §6 "Юу ярьж байна" -- real, high-rated, commented reviews
    // for the homepage's CustomerVoices section. See getFeaturedReviews.
    featured: publicProcedure.query(() => getFeaturedReviews(8)),
    // protectedProcedure: a guest has no order history to verify against, so
    // there's nothing meaningful to check — the ProductDetail page only asks
    // this for a logged-in shopper.
    eligibility: protectedProcedure.input(z.object({ productId: z.number().int().positive() })).query(({ ctx, input }) => getReviewEligibility(ctx.user.id, input.productId)),
    create: protectedProcedure
      .input(z.object({ productId: z.number().int().positive(), rating: z.number().int().min(1).max(5), comment: nullableText(2_000) }))
      .mutation(async ({ ctx, input }) => {
        // Abuse screen (Tom, 2026-09-13): buyers may review, but not insult.
        // Lexical layer always; Claude layer when ANTHROPIC_API_KEY is set.
        if (input.comment?.trim()) {
          const verdict = await screenText(input.comment);
          if (!verdict.allowed) {
            console.warn(`[moderation] review rejected user=${ctx.user.id} product=${input.productId} category=${verdict.category} source=${verdict.source}`);
            throw new TRPCError({ code: "BAD_REQUEST", message: MODERATION_REJECT_MESSAGE });
          }
        }
        try {
          return await createProductReview({ userId: ctx.user.id, productId: input.productId, rating: input.rating, comment: input.comment ?? null });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Сэтгэгдэл бичиж чадсангүй." });
        }
      }),
  }),
  content: router({
    latestPosts: publicProcedure.query(() => getPublishedPosts()),
    // Same underlying query as latestPosts (getPublishedPosts already has no
    // LIMIT -- Home.tsx just .slice(0,3)s the result client-side) -- a
    // second, clearly-named endpoint for the /journal archive page so that
    // page doesn't read as "fetch the latest posts" for what's actually
    // every published post.
    allPosts: publicProcedure.query(() => getPublishedPosts()),
    // publicProcedure, not staffProcedure: a guest reading a real published
    // post is the overwhelmingly common case. The staff/admin bypass below
    // is what makes "Preview" (AdminPostsPanel.tsx) work on an unpublished
    // or not-yet-scheduled post -- ctx.user is populated from the session
    // cookie on every request regardless of the calling procedure's public/
    // protected status (verified in server/_core/context.ts), so this can
    // branch on role without needing a second procedure.
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(240) })).query(({ ctx, input }) => {
      const bypassGate = ctx.user?.role === "staff" || ctx.user?.role === "admin";
      return getPublishedPostBySlug(input.slug, { bypassGate });
    }),
    siteMedia: publicProcedure.query(() => getSiteMedia()),
    siteText: publicProcedure.query(() => getSiteText()),
    // "Controls everything" admin overhaul (2026-09-08, Phase A): public so
    // the checkout page (delivery fee/free-shipping threshold) can read it
    // without an account, same public tier as siteText/siteMedia above.
    storeSettings: publicProcedure.query(() => getStoreSettings()),
    // "Controls everything" admin overhaul (2026-09-08, Phase J): replaces
    // client/src/components/home/locations-data.ts's pure hardcoded array
    // -- StoreLocatorSection/SiteFooter/Checkout's pickup-branch picker all
    // read this live query now instead of importing that file.
    // Stores only (2026-09-11): a warehouse is a stock location, never a
    // place a shopper can pick up from or visit.
    branches: publicProcedure.query(() => getStorefrontBranches()),
    // 2026-09-12: the storefront's single source for catalogue categories.
    // Home, /shop's discovery cards, the header drawer and the footer read
    // this instead of the old hardcoded categories-data.ts array, so an
    // admin rename now reaches every surface at once (it previously only
    // changed /shop's filter pills).
    categories: publicProcedure.query(() => getPublishedCategories()),
    // Only the rows an admin has actually saved; the client merges them
    // over shared/legal-documents.ts so an unedited page still renders.
    siteDocuments: publicProcedure.query(() => getSiteDocuments()),
    // The live discount ladder. publicProcedure because the homepage's
    // membership section shows it to signed-out visitors as the reason to
    // register -- it is marketing, not account data.
    loyaltyTiers: publicProcedure.query(() => getLoyaltyTierTable()),
  }),
  cart: router({
    // publicProcedure, not protectedProcedure: UX-RESEARCH.md priority #1 is
    // guest checkout — a shopper can browse, add to cart, and order without
    // an account. See resolveCartOwnerForRead/Write below for how an
    // anonymous cart is identified.
    current: publicProcedure.query(({ ctx }) => {
      const owner = resolveCartOwnerForRead(ctx);
      return owner ? getActiveCartForOwner(owner) : null;
    }),
    // PREMIUM-FEATURES.md TIER 4: checkout-preview for the routine bundle
    // discount — mirrors exactly what createOrderFromActiveCart will charge,
    // since both call the same getApplicableRoutineDiscount.
    applicableRoutineDiscount: publicProcedure.query(async ({ ctx }) => {
      const owner = resolveCartOwnerForRead(ctx);
      if (!owner) return null;
      const cart = await getActiveCartForOwner(owner);
      if (!cart?.items.length) return null;
      return getApplicableRoutineDiscount(cart.items);
    }),
    // Checkout-preview for a manually-entered coupon code -- applies to the
    // subtotal *after* the routine discount, mirroring exactly what
    // createOrderFromActiveCart will charge (see the stacking-order comment
    // there). A publicProcedure like the rest of `cart` (guest checkout).
    applicableCouponDiscount: publicProcedure.input(z.object({ code: z.string().trim().min(1).max(40) })).query(async ({ ctx, input }) => {
      const owner = resolveCartOwnerForRead(ctx);
      if (!owner) throw new TRPCError({ code: "BAD_REQUEST", message: "Сагс хоосон байна." });
      const cart = await getActiveCartForOwner(owner);
      if (!cart?.items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Сагс хоосон байна." });
      const subtotalMnt = cart.items.reduce((sum, item) => sum + item.priceMnt * item.quantity, 0);
      const routineDiscount = await getApplicableRoutineDiscount(cart.items);
      try {
        // A signed-in shopper gets the per-customer cap (R1) checked here
        // already; a guest's phone is only known at order time, so their
        // cap is enforced in createOrderFromActiveCart instead.
        return await validateDiscountCode(input.code, subtotalMnt - (routineDiscount?.discountMnt ?? 0), { userId: ctx.user?.id ?? null, phone: null });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Хямдралын код шалгаж чадсангүй." });
      }
    }),
    // Checkout-preview for the loyalty tier discount — mirrors exactly what
    // createOrderFromActiveCart will charge (same base: subtotal after the
    // routine discount, then after the coupon, per the stacking order
    // there). Added because the client used to re-derive this number itself
    // from loyalty.myStatus's raw discountPercent (same formula, but a
    // second, independent implementation of it) instead of asking the
    // server for the real preview the way routine/coupon already do.
    // protectedProcedure: loyalty tiers are a signed-in account benefit,
    // same gate as loyalty.myStatus below.
    applicableLoyaltyDiscount: protectedProcedure.input(z.object({ couponCode: z.string().trim().max(40).nullable().optional() })).query(async ({ ctx, input }) => {
      const owner = resolveCartOwnerForRead(ctx);
      if (!owner) return null;
      const cart = await getActiveCartForOwner(owner);
      if (!cart?.items.length) return null;
      const subtotalMnt = cart.items.reduce((sum, item) => sum + item.priceMnt * item.quantity, 0);
      const routineDiscount = await getApplicableRoutineDiscount(cart.items);
      const afterRoutineMnt = subtotalMnt - (routineDiscount?.discountMnt ?? 0);
      let afterCouponMnt = afterRoutineMnt;
      if (input.couponCode) {
        try {
          const coupon = await validateDiscountCode(input.couponCode, afterRoutineMnt, { userId: ctx.user.id, phone: null });
          afterCouponMnt = afterRoutineMnt - coupon.discountMnt;
        } catch {
          // An invalid/stale coupon at preview time isn't this endpoint's
          // problem to report — applicableCouponDiscount already surfaces
          // that error where the coupon box itself lives. Just preview the
          // loyalty discount as if the coupon weren't there.
        }
      }
      return getApplicableLoyaltyDiscount(ctx.user.id, afterCouponMnt);
    }),
    // "Controls everything" admin overhaul (2026-09-08, Phase I): Checkout's
    // own "apply my store credit" toggle -- protectedProcedure (only a
    // registered customer has a balance at all; a guest never sees this).
    myStoreCreditBalance: protectedProcedure.query(({ ctx }) => getUserStoreCreditBalance(ctx.user.id)),
    // PHASE 2 of product variants: exactly one of productId/variantId.
    // productId resolves to that product's default variant server-side —
    // every existing caller (Shop quick-add, routine bulk-add, Profile
    // reorder, quick-view without a picker) keeps working unchanged.
    // variantId is what a real picker (ProductDetail/QuickView, only shown
    // when a product has more than one option) sends to buy a specific one.
    addItem: moderateRateLimitedProcedure
      .input(z.object({
        productId: z.number().int().positive().optional(),
        variantId: z.number().int().positive().optional(),
        quantity: z.number().int().min(1).max(100),
      }).refine(value => (value.productId === undefined) !== (value.variantId === undefined), { message: "Provide exactly one of productId or variantId." }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await addCartItem({ owner: resolveCartOwnerForWrite(ctx), ...input });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to add this item to the cart." });
        }
      }),
    updateItemQuantity: moderateRateLimitedProcedure.input(z.object({ itemId: z.number().int().positive(), quantity: z.number().int().min(0).max(100) })).mutation(async ({ ctx, input }) => {
      try {
        return await updateCartItemQuantity({ owner: resolveCartOwnerForWrite(ctx), ...input });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to update this cart item." });
      }
    }),
  }),
  checkout: router({
    // Strict tier, not moderate: unlike cart mutations this both writes a
    // permanent order row and decrements real stock (see
    // createOrderFromActiveCart), so it needs the same tight cap as
    // login/register rather than the browsing-friendly cart limit.
    createOrder: strictRateLimitedProcedure.input(z.object({
      // Idempotency key, one per checkout attempt (see orders.clientRequestId).
      // Optional so an older client keeps working; the browser always sends it.
      clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
      customerName: z.string().trim().min(2).max(160),
      customerPhone: z.string().trim().min(6).max(40).regex(/^[0-9+()\-\s]{6,40}$/, "Утасны дугаараа зөв оруулна уу.").refine(value => value.replace(/\D/g, "").length >= 8, "Утасны дугаараа зөв оруулна уу."),
      customerEmail: z.string().trim().email().max(320).nullable().optional(),
      deliveryMethod: z.enum(["ub_delivery", "store_pickup"]),
      deliveryAddress: z.string().trim().min(8).max(2_000).nullable().optional(),
      district: districtSchema,
      // "Controls everything" admin overhaul (2026-09-08, Phase J): used to
      // be a hardcoded z.enum of 3 branch names, silently out of sync with
      // the real 4-branch locations-data.ts array (branch 04 was never
      // selectable). The real check against the live branches table now
      // happens in createOrderFromActiveCart, the actual authority -- same
      // "validate against real DB state in the resolver, not a static zod
      // enum" pattern as couponCode.
      pickupBranch: z.string().trim().max(160).or(z.literal("")).nullable().optional(),
      paymentMethod: z.enum(["qpay", "storepay", "bank_transfer", "card", "cash_on_delivery"]),
      couponCode: z.string().trim().min(1).max(40).nullable().optional(),
      trafficSource: z.string().trim().min(1).max(200).nullable().optional(),
      // "Controls everything" admin overhaul (2026-09-08, Phase I): re-
      // validated against the shopper's real balance server-side
      // (createOrderFromActiveCart), never trusted as the actual amount
      // applied -- same discipline as couponCode above.
      applyStoreCreditMnt: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    }).superRefine((value, context) => {
      if (value.deliveryMethod === "ub_delivery" && !value.deliveryAddress) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "A delivery address is required for Ulaanbaatar delivery.", path: ["deliveryAddress"] });
      }
      if (value.deliveryMethod === "store_pickup" && !value.pickupBranch) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Select a SUGI branch for store pickup.", path: ["pickupBranch"] });
      }
    })).mutation(async ({ ctx, input }) => {
      let order;
      try {
        const deviceType = parseDeviceType(ctx.req.headers["user-agent"]);
        // Tier E: the session cookie is httpOnly and already on the
        // request, so unlike trafficSource this needs no client change --
        // resolved entirely server-side, same "captured once at checkout"
        // discipline as everything else here.
        const visitorToken = parseCookieHeader(ctx.req.headers.cookie ?? "")[VISITOR_SESSION_COOKIE_NAME];
        const visitorSessionId = visitorToken ? await getVisitorSessionIdByToken(visitorToken) : null;
        order = await createOrderFromActiveCart({ owner: resolveCartOwnerForWrite(ctx), ...input, deviceType, visitorSessionId });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to place this order." });
      }
      // Best-effort: a failed confirmation email should never undo an
      // already-placed (and stock-decremented) order. A replayed attempt
      // already sent its email the first time.
      if (!order.replayed) {
        try {
          await sendOrderConfirmationEmail(order);
        } catch (error) {
          console.error("[checkout.createOrder] Failed to send order confirmation email", error);
        }
      }
      return order;
    }),
  }),
  // Tier E analytics: best-effort, first-party pageview telemetry so
  // Conversion Rate can be a real number (orders ÷ sessions) instead of a
  // metric skipped for lack of any visitor tracking. Public/anonymous by
  // design -- fired by every visitor, not just signed-in shoppers.
  telemetry: router({
    pageview: lenientRateLimitedProcedure.input(z.object({
      path: z.string().trim().min(1).max(300),
      trafficSource: z.string().trim().max(200).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      // Silent no-op for a likely bot -- no row, no cookie. Never an error;
      // the client never awaits or checks this call's result.
      if (isLikelyBot(ctx.req.headers["user-agent"])) return { ok: true } as const;
      const existingToken = parseCookieHeader(ctx.req.headers.cookie ?? "")[VISITOR_SESSION_COOKIE_NAME];
      const deviceType = parseDeviceType(ctx.req.headers["user-agent"]);
      const { sessionToken, isNewToken } = await resolvePageviewSession({ existingToken, path: input.path, trafficSource: input.trafficSource, deviceType });
      if (isNewToken) ctx.res.cookie(VISITOR_SESSION_COOKIE_NAME, sessionToken, getVisitorSessionCookieOptions(ctx.req));
      return { ok: true } as const;
    }),
  }),
  orders: router({
    // Audit 2026-09-09 (R4): cursor-paged, newest first (see getOrdersForUser).
    mine: protectedProcedure.input(z.object({
      cursor: z.number().int().positive().nullish(),
      limit: z.number().int().min(1).max(50).optional(),
    }).optional()).query(({ ctx, input }) => getOrdersForUser(ctx.user.id, { cursor: input?.cursor ?? null, limit: input?.limit })),
    // Admin overhaul (2026-09-08, Phase F): a guest checkout customer's only
    // way to check status until now. A mutation (not a query) so the phone
    // number stays out of a GET query string, matching auth.login/
    // checkout.createOrder's own choice for sensitive input. strictRateLimit
    // (8/15min/IP) since this is exactly the enumeration-risk shape those
    // other public identity-lookup endpoints share.
    lookup: strictRateLimitedProcedure.input(z.object({ orderNumber: z.string().trim().min(1).max(32), phone: phoneSchema })).mutation(async ({ input }) => {
      const order = await getOrderForTracking(input.orderNumber, input.phone);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Захиалга олдсонгүй. Захиалгын дугаар болон утасны дугаараа шалгана уу." });
      return order;
    }),
    // Admin overhaul (2026-09-08, Phase G): the first way a logged-in
    // customer can cancel their own order without contacting support --
    // ownership + status guards live in cancelOwnOrder (server/db.ts), which
    // then reuses the existing updateAdminOrder for the actual transition
    // (same forward-only ladder, same stock-restore logic). Not an admin
    // action, so no logAdminAction -- this is the customer acting on their
    // own record, the same trust tier as profile.update.
    cancel: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      let order;
      try {
        order = await cancelOwnOrder(input.id, ctx.user.id);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to cancel order." });
      }
      try {
        await sendOrderStatusUpdateEmail(order);
      } catch (error) {
        console.error("[orders.cancel] Failed to send status update email", error);
      }
      return order;
    }),
  }),
  // Customer account page: editable name/phone, an avatar photo, and a
  // saved-address book (checkout can prefill from the default address so
  // returning shoppers don't retype it every order).
  profile: router({
    // 2026-09-05: phone is the login identifier now (users.phone UNIQUE), so
    // an edit here has to go through the same normalize-then-check-conflict
    // discipline register/admin.updateUserPhone use -- otherwise two
    // differently-formatted-but-identical numbers could collide invisibly,
    // or a shopper could accidentally hand their login phone to someone
    // else's account without any warning.
    update: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(160).nullable().optional(), phone: phoneSchema.nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        let normalizedPhone: string | null | undefined;
        if (input.phone !== undefined) {
          if (input.phone === null) {
            normalizedPhone = null;
          } else {
            normalizedPhone = normalizePhoneForVerifyMn(input.phone);
            if (!normalizedPhone) throw new TRPCError({ code: "BAD_REQUEST", message: "Утасны дугаараа зөв оруулна уу." });
            const existing = await findUserByPhone(normalizedPhone);
            if (existing && existing.id !== ctx.user.id) throw new TRPCError({ code: "CONFLICT", message: "Энэ утасны дугаарыг өөр хэрэглэгч ашиглаж байна." });
          }
        }
        const updated = await updateUserProfile(ctx.user.id, { ...input, phone: normalizedPhone });
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Профайл шинэчилж чадсангүй." });
        const { passwordHash: _omit, ...safeUser } = updated;
        return safeUser;
      }),
    uploadAvatar: protectedProcedure
      .input(z.object({
        fileName: z.string().trim().min(1).max(120),
        contentType: z.enum(imageContentTypes),
        dataBase64: z.string().min(16).max(7_000_000),
      }))
      .mutation(async ({ ctx, input }) => {
        const rawBase64 = input.dataBase64.includes(",") ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1) : input.dataBase64;
        const buffer = Buffer.from(rawBase64, "base64");
        if (buffer.length === 0 || buffer.length > 4 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Профайл зураг 1 байт - 4 МБ хооронд байх ёстой." });
        }
        assertImageSignature(buffer, input.contentType);
        const extension = input.contentType === "image/jpeg" ? "jpg" : input.contentType === "image/png" ? "png" : "webp";
        const processed = await processUploadedImageOrThrow(buffer, input.contentType, IMAGE_MAX_DIMENSION.avatar);
        // Nudity / adult-content screen (Tom, 2026-09-13). Runs on the
        // resized bytes that would be stored; a model failure refuses the
        // upload rather than skipping the check -- see imageSafety.ts.
        let safety;
        try {
          safety = await classifyImageSafety(processed);
        } catch (error) {
          console.error("[image-safety] avatar screen unavailable", error instanceof Error ? error.message : error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Зургийн шалгалт түр боломжгүй байна. Дараа дахин оролдоно уу." });
        }
        if (!safety.allowed) {
          console.warn(`[image-safety] avatar rejected user=${ctx.user.id} reason=${safety.reason} ${formatScores(safety.scores)}`);
          throw new TRPCError({ code: "BAD_REQUEST", message: IMAGE_SAFETY_REJECT_MESSAGE });
        }
        const stored = await storagePut(`avatars/${ctx.user.id}/avatar-${Date.now()}.${extension}`, processed, input.contentType);
        const updated = await updateUserAvatar(ctx.user.id, stored.url);
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Зураг хадгалж чадсангүй." });
        const { passwordHash: _omit, ...safeUser } = updated;
        return safeUser;
      }),
    removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
      const updated = await updateUserAvatar(ctx.user.id, null);
      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Зураг хасаж чадсангүй." });
      const { passwordHash: _omit, ...safeUser } = updated;
      return safeUser;
    }),
    addresses: router({
      list: protectedProcedure.query(({ ctx }) => getUserAddresses(ctx.user.id)),
      create: protectedProcedure.input(addressWriteSchema).mutation(({ ctx, input }) => createUserAddress(ctx.user.id, input)),
      update: protectedProcedure
        .input(addressWriteSchema.partial().extend({ id: z.number().int().positive() }).refine(
          value => Object.keys(value).some(key => key !== "id"),
          { message: "Provide at least one address field to update." },
        ))
        .mutation(async ({ ctx, input }) => {
          const { id, ...rest } = input;
          try {
            return await updateUserAddress(ctx.user.id, id, rest);
          } catch (error) {
            throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "Хаяг олдсонгүй." });
          }
        }),
      delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        try {
          return await deleteUserAddress(ctx.user.id, input.id);
        } catch (error) {
          throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "Хаяг олдсонгүй." });
        }
      }),
    }),
    // "Гоо сайхны профайл" tab. Drives catalog.recommended (PREMIUM-FEATURES.md
    // TIER 1) — matched against the same skinType/skinConcerns/interiorStyle
    // tags on products.
    updatePreferences: protectedProcedure
      .input(z.object({
        skinType: skinTypeSchema,
        skinConcerns: skinConcernsSchema,
        interiorStyle: interiorStyleSchema,
        // Both fully optional, never asked at signup -- purely a voluntary
        // "help us personalize" field the shopper can fill in from their
        // own profile page. See the schema comment on users.birthYear.
        birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
        occupation: z.string().trim().max(120).nullable().optional(),
        // Preference Profile v2 (2026-09-01) quiz wizard fields -- all
        // optional, same "never asked at signup" discipline as above.
        gender: genderSchema,
        primaryDistrict: districtSchema,
        skinRoutineComplexity: skinRoutineComplexitySchema,
        hairType: hairTypeSchema,
        hairConcerns: hairConcernsSchema,
        fragrancePreference: fragrancePreferenceSchema,
        wellnessInterests: wellnessInterestsSchema,
        hasYoungChildren: z.boolean().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const updated = await updateUserPreferences(ctx.user.id, input);
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Тохиргоо хадгалж чадсангүй." });
        const { passwordHash: _omit, ...safeUser } = updated;
        return safeUser;
      }),
    updateNotifications: protectedProcedure
      .input(z.object({ emailOptIn: z.boolean().optional(), smsOptIn: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const updated = await updateNotificationPreferences(ctx.user.id, input);
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Тохиргоо хадгалж чадсангүй." });
        const { passwordHash: _omit, ...safeUser } = updated;
        return safeUser;
      }),
    // "Аюулгүй байдал" tab — change password without losing the current
    // session (re-signs a fresh token below), while every OTHER
    // already-issued session/device is invalidated by the sessionVersion
    // bump inside changeUserPassword, same as the forgot-password flow.
    changePassword: strictRateLimitedProtectedProcedure
      .input(z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(8).max(200) }))
      .mutation(async ({ ctx, input }) => {
        const user = await getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Хэрэглэгч олдсонгүй." });
        const valid = await verifyPassword(input.currentPassword, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Одоогийн нууц үг буруу байна." });
        const newHash = await hashPassword(input.newPassword);
        const updated = await changeUserPassword(ctx.user.id, newHash);
        const token = await signSessionToken(updated.id, updated.sessionVersion);
        ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));
        return { success: true } as const;
      }),
    // "Аюулгүй байдал" tab — permanent self-service deletion. Restricted to
    // plain "user" accounts: admin/staff can author content/logs that a
    // RESTRICT foreign key protects (see deleteUserAccount in server/db.ts),
    // and losing the store's only admin this way would be a real outage, so
    // those roles are pointed at an existing admin instead.
    deleteAccount: strictRateLimitedProtectedProcedure
      .input(z.object({ password: z.string().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "user") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Админ/ажилтны эрхтэй акаунтыг энэ хэсгээс устгах боломжгүй. Дэлгүүрийн админтай холбогдоно уу." });
        }
        const user = await getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Хэрэглэгч олдсонгүй." });
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Нууц үг буруу байна." });
        await deleteUserAccount(ctx.user.id);
        ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
        return { success: true } as const;
      }),
    // "Хүслийн жагсаалт" tab.
    wishlist: router({
      list: protectedProcedure.query(({ ctx }) => getWishlistForUser(ctx.user.id)),
      toggle: protectedProcedure
        .input(z.object({ productId: z.number().int().positive(), saved: z.boolean(), notifyOnRestock: z.boolean().optional() }))
        .mutation(async ({ ctx, input }) => {
          if (input.saved) {
            try {
              await addWishlistItem(ctx.user.id, input.productId, input.notifyOnRestock ?? false);
            } catch (error) {
              throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "Бүтээгдэхүүн олдсонгүй." });
            }
          } else {
            await removeWishlistItem(ctx.user.id, input.productId);
          }
          return { success: true } as const;
        }),
    }),
  }),
  payments: router({
    qpayAvailability: publicProcedure.query(() => getQPayAvailability()),
    qpayCreateInvoice: protectedProcedure.input(z.object({ orderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (!getQPayAvailability().configured) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "QPay merchant credentials are not configured yet." });
      }
      const order = await getOrderForUser(input.orderId, ctx.user.id);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      if (order.paymentMethod !== "qpay") throw new TRPCError({ code: "BAD_REQUEST", message: "This order is not configured for QPay." });
      if (order.paymentStatus === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "This order has already been paid." });
      // Audit 2026-09-09: a customer could cancel a pending QPay order (stock
      // restored), then still mint an invoice for it and pay -- the webhook
      // would then re-confirm an order whose goods were already released.
      // markQPayPaymentAttemptPaid now refuses to touch a closed order too;
      // this is the earlier, friendlier stop.
      if (order.status === "cancelled" || order.status === "returned") throw new TRPCError({ code: "BAD_REQUEST", message: "This order is closed and can no longer be paid." });
      // A second click, a retry, a reload: hand back the invoice this order
      // already has rather than minting another one that is just as payable
      // (2026-09-12 audit). Only an attempt still awaiting payment counts.
      const previous = await getLatestQPayPaymentAttemptForOrder(order.id);
      if (previous && previous.provider === "qpay" && previous.status === "created" && previous.responseJson) {
        try {
          const parsed = parseQPayInvoicePayload(JSON.parse(previous.responseJson) as Record<string, unknown>);
          if (parsed.invoiceId === previous.providerInvoiceId) return { orderId: order.id, orderNumber: order.orderNumber, invoiceId: previous.providerInvoiceId, qrText: parsed.qrText, urls: parsed.urls };
        } catch {
          // An unreadable stored response is not a reason to fail: mint afresh.
        }
      }
      const invoice = await createQPayInvoice({
        senderInvoiceNo: order.orderNumber,
        amountMnt: order.totalMnt,
        description: `SUGI ASAYAKE order ${order.orderNumber}`,
        // Audit 2026-09-09 (R7): prefer the configured public origin; the
        // request's Host header is only the fallback for a bare deployment.
        callbackUrl: `${ENV.publicBaseUrl || `${ctx.req.protocol}://${ctx.req.get("host")}`}/api/payments/qpay/callback`,
      });
      await createQPayPaymentAttempt({ orderId: order.id, providerInvoiceId: invoice.invoiceId, responseJson: JSON.stringify(invoice.raw) });
      return { orderId: order.id, orderNumber: order.orderNumber, invoiceId: invoice.invoiceId, qrText: invoice.qrText, urls: invoice.urls };
    }),
    qpayStatus: protectedProcedure.input(z.object({ orderId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const order = await getOrderForUser(input.orderId, ctx.user.id);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      const attempt = await getLatestQPayPaymentAttemptForOrder(order.id);
      return { orderId: order.id, paymentStatus: order.paymentStatus, orderStatus: order.status, invoiceId: attempt?.providerInvoiceId ?? null, attemptStatus: attempt?.status ?? null };
    }),
    // StorePay (2026-09-12). Same three-step shape as QPay above: is it
    // configured, open the request, then poll our own order row -- never the
    // provider's word from the browser.
    storepayAvailability: publicProcedure.query(() => getStorepayAvailability()),
    // What this shopper may borrow, asked before they commit to the option.
    // A phone number is personal data, so this is deliberately not public:
    // only a signed-in shopper can ask, and only about one number at a time.
    storepayLimit: protectedProcedure.input(z.object({ mobileNumber: z.string().trim().min(6).max(20) })).mutation(async ({ input }) => {
      const mobileNumber = normaliseMobileNumber(input.mobileNumber);
      if (!mobileNumber) throw new TRPCError({ code: "BAD_REQUEST", message: "Утасны дугаараа зөв оруулна уу (8 орон)." });
      try {
        return { mobileNumber, possibleAmountMnt: await storepayPossibleAmount(mobileNumber) };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "StorePay-ээс хариу ирсэнгүй." });
      }
    }),
    storepayCreateLoan: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), mobileNumber: z.string().trim().min(6).max(20) })).mutation(async ({ ctx, input }) => {
      if (!(await getStorepayAvailability()).configured) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "StorePay-ийн тохиргоо хараахан ороогүй байна." });
      const mobileNumber = normaliseMobileNumber(input.mobileNumber);
      if (!mobileNumber) throw new TRPCError({ code: "BAD_REQUEST", message: "Утасны дугаараа зөв оруулна уу (8 орон)." });
      const order = await getOrderForUser(input.orderId, ctx.user.id);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      if (order.paymentMethod !== "storepay") throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ захиалга StorePay-ээр төлөхөөр үүсээгүй байна." });
      if (order.paymentStatus === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ захиалга аль хэдийн төлөгдсөн." });
      if (order.status === "cancelled" || order.status === "returned") throw new TRPCError({ code: "BAD_REQUEST", message: "Хаагдсан захиалгыг төлөх боломжгүй." });
      // Same rule as QPay above: one open loan request per order. StorePay
      // has already pushed it to the shopper's app; asking twice would leave
      // two requests open.
      const previous = await getLatestQPayPaymentAttemptForOrder(order.id);
      if (previous && previous.provider === "storepay" && previous.status === "created") {
        return { orderId: order.id, orderNumber: order.orderNumber, loanId: previous.providerInvoiceId };
      }
      let loan;
      try {
        loan = await createStorepayLoan({
          mobileNumber,
          description: `SUGI ASAYAKE ${order.orderNumber}`,
          amountMnt: order.totalMnt,
          callbackUrl: `${ENV.publicBaseUrl || `${ctx.req.protocol}://${ctx.req.get("host")}`}/api/payments/storepay/callback`,
        });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "StorePay зээл үүсгэж чадсангүй." });
      }
      await createStorepayPaymentAttempt({ orderId: order.id, providerInvoiceId: loan.loanId, responseJson: JSON.stringify(loan.raw) });
      return { orderId: order.id, orderNumber: order.orderNumber, loanId: loan.loanId };
    }),
  }),
  /**
   * Admin face gate (2026-09-08). Scope, restated because it is the thing
   * most likely to be misread later: this is ONLY for the five roles that can
   * open /admin. No storefront page touches this router, and no customer is
   * ever asked for camera access.
   *
   * Every procedure here is protected (never public): a user must already
   * have passed phone+password login before any of this is reachable. The
   * face check is a SECOND factor, never a way in on its own.
   */
  faceAuth: router({
    /** Drives which of the three gate states the client renders. Cheap and
     *  called on every /admin load, so it stays a single indexed lookup. */
    status: protectedProcedure.query(async ({ ctx }) => {
      const gateEnabled = isFaceGateEnabled();
      // When the kill switch is off, report "verified" so the client renders
      // the panel with no camera anywhere -- exactly today's pre-gate
      // behaviour, which is the entire point of the escape hatch.
      if (!gateEnabled || !isAdminPanelRole(ctx.user.role)) {
        return { gateEnabled, enrolled: true, verified: true, modelStale: false, idleTimeoutMs: FACE_IDLE_TIMEOUT_MS };
      }
      const enrollment = await getFaceEnrollment(ctx.user.id);
      const hasProof = await hasValidFaceProof(ctx.req, ctx.user.id, ctx.user.sessionVersion);
      // A proof cookie only counts while an enrollment actually exists.
      //
      // Without this the two were independent, so clearing someone's
      // enrollment left their existing proof valid for its full 8-hour
      // window: an admin revoking access (the person left, or their face
      // stopped matching) would not actually revoke anything until that
      // cookie expired. Requiring both means a reset takes effect on the
      // next request, which is what "reset" has to mean.
      const verified = hasProof && !!enrollment;
      return {
        gateEnabled,
        enrolled: !!enrollment,
        verified,
        // A descriptor from a superseded model can't be compared with a new
        // one; surfaced separately so the UI says "enroll again" rather than
        // "your face didn't match".
        modelStale: !!enrollment && enrollment.modelVersion !== FACE_MODEL_VERSION,
        // The browser needs the window to run its own countdown and warning;
        // the server enforces it regardless, through the proof's own `exp`.
        idleTimeoutMs: FACE_IDLE_TIMEOUT_MS,
      };
    }),

    /**
     * "Somebody is actually working here" -- slides the idle deadline
     * forward. Sent by the browser ONLY after real input (pointer, key,
     * touch, scroll), never by the panel's own polling, or an open dashboard
     * would renew itself forever and the 25-minute lock would be fiction.
     *
     * Cheap on purpose: verify the existing proof, re-sign it, set the
     * cookie. No database work, so every open panel can call it every couple
     * of minutes without being noticed.
     */
    heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
      if (!isFaceGateEnabled() || !isAdminPanelRole(ctx.user.role)) return { ok: true as const, idleExpiresAt: null, absoluteExpiresAt: null };
      return refreshFaceProof({ req: ctx.req, res: ctx.res, userId: ctx.user.id, sessionVersion: ctx.user.sessionVersion });
    }),

    /** Ends the face session now -- the browser's idle timer firing, or
     *  someone deliberately locking the screen before walking away. */
    lock: protectedProcedure.input(z.object({ reason: z.enum(["idle", "manual"]) })).mutation(async ({ ctx, input }) => {
      await lockFaceSession({ req: ctx.req, res: ctx.res, userId: ctx.user.id, reason: input.reason });
      return { ok: true as const };
    }),

    /**
     * Stores the averaged reference descriptor for this account.
     *
     * `consented` is a literal true rather than a boolean so the consent gate
     * is enforced by the schema itself, not merely by the UI that normally
     * precedes it -- face data is sensitive personal data under Mongolia's
     * Personal Data Protection Law, and a client that skipped the consent
     * screen must not be able to enroll.
     */
    enroll: strictRateLimitedProtectedProcedure
      .input(z.object({
        descriptor: z.array(z.number()).length(FACE_DESCRIPTOR_LENGTH),
        sampleCount: z.number().int().min(1).max(20),
        // Per-pose descriptors from the guided enrollment (centre/left/
        // right). Optional so an older client, or an enrollment where the
        // side poses were skipped, still works off the frontal vector alone.
        poses: z.array(z.object({
          pose: z.string().max(20),
          descriptor: z.array(z.number()).length(FACE_DESCRIPTOR_LENGTH),
        // 12 (2026-09-13): the Face ID-style enrolment stores the centre plus
        // eight compass directions = 9 views; headroom for two more.
        })).max(12).optional(),
        consented: z.literal(true),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isAdminPanelRole(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
        }
        if (!isValidFaceDescriptor(input.descriptor)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Царайн өгөгдөл буруу байна." });
        }
        // Every pose is validated the same way the primary descriptor is --
        // a malformed or hand-crafted vector must never reach the distance
        // math, and poses are just as much an input as the main one.
        const poses = (input.poses ?? []).filter(p => isValidFaceDescriptor(p.descriptor));
        await upsertFaceEnrollment({
          userId: ctx.user.id,
          descriptor: input.descriptor,
          sampleCount: input.sampleCount,
          poses,
          modelVersion: FACE_MODEL_VERSION,
        });
        await recordFaceAttempt({
          userId: ctx.user.id,
          outcome: "enrolled",
          detail: `samples=${input.sampleCount} poses=${(input.poses ?? []).length}`,
          ip: ctx.req.ip ?? null,
        });
        // Enrolling does NOT by itself open /admin: the user still performs a
        // live check immediately afterwards. Otherwise "enroll" would be a
        // way to bypass the very gate it exists to feed.
        return { ok: true as const };
      }),

    /** Issues a fresh single-use liveness challenge (blink / turn / open
     *  mouth), randomised per attempt so a held-up photo can't satisfy it. */
    startVerification: strictRateLimitedProtectedProcedure.mutation(async ({ ctx }) => {
      if (!isAdminPanelRole(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
      }
      return startFaceVerification(ctx.user.id);
    }),

    /** Compares the submitted descriptor against the enrolled one and, on a
     *  match, sets the per-device proof cookie. */
    completeVerification: strictRateLimitedProtectedProcedure
      .input(z.object({
        challengeId: z.number().int().positive(),
        descriptor: z.array(z.number()).length(FACE_DESCRIPTOR_LENGTH),
        livenessPassed: z.boolean(),
        // What the browser actually measured. Recorded into
        // face_attempts.detail so liveness thresholds can be tuned from real
        // attempts by real staff instead of guessed at -- the same discipline
        // already applied to FACE_MATCH_THRESHOLD via the distance column.
        // Untrusted client-reported data: used for diagnostics only, never
        // to make the pass/fail decision.
        diagnostic: z.string().max(FACE_DIAGNOSTIC_MAX).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isAdminPanelRole(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
        }
        return completeFaceVerification({
          userId: ctx.user.id,
          sessionVersion: ctx.user.sessionVersion,
          challengeId: input.challengeId,
          descriptor: input.descriptor,
          livenessPassed: input.livenessPassed,
          diagnostic: input.diagnostic,
          req: ctx.req,
          res: ctx.res,
        });
      }),

    /** Lets someone re-enroll their own face without an admin (new glasses,
     *  a beard, a different camera). Clears the enrollment and the proof
     *  cookie so the next /admin load starts the flow from the top. */
    resetOwnEnrollment: strictRateLimitedProtectedProcedure.mutation(async ({ ctx }) => {
      await deleteFaceEnrollment(ctx.user.id);
      clearFaceProofCookie(ctx.req, ctx.res);
      return { ok: true as const };
    }),
  }),
  admin: router({
    // staffProcedure, not adminProcedure: staff should still see what's
    // going on operationally (orders, low stock), just not the money —
    // revenue and the active-user count are redacted below the plain-admin
    // tier. ordersLast7d/ordersPrevious7d/ordersDailySeries (2026-09-06,
    // new admin dashboard) pass through the `...summary` spread untouched —
    // deliberately, not an oversight: order *counts* are operational, same
    // tier as totalOrders/recentOrders above.
    dashboardSummary: anyStaffProcedure.query(async ({ ctx }) => {
      const summary = await getAdminDashboardSummary();
      if (ctx.user.role === "admin") return summary;
      return { ...summary, totalRevenueMnt: null, activeUsers: null };
    }),
    // TIER 6: basic DB/storage reachability — not Sentry, just two pings for
    // a small dashboard widget. Non-sensitive (no data, just up/down + a
    // terse error string), so staff can see it too — the same audience as
    // the rest of the dashboard.
    systemHealth: anyStaffProcedure.query(async () => {
      // Audit 2026-09-09 (architecture debt #3): the store-credit invariant
      // check rides on this same card. Cached for a minute -- it scans the
      // ledger, and the dashboard polls this query every 60s.
      const [db, storage, storeCredit, stockLedger] = await Promise.all([
        dbPing(),
        storagePing(),
        getOrSetCached("storeCreditDrift", 60_000, () => getStoreCreditDrift()).catch(() => null),
        // 2026-09-11: same idea for the stock ledger (server/stockLedger.ts).
        getOrSetCached("stockLedgerDrift", 60_000, () => getStockLedgerHealth()).catch(() => null),
      ]);
      return {
        db, storage,
        storeCredit: storeCredit ? { ok: storeCredit.driftedAccounts === 0, ...storeCredit } : null,
        stockLedger: stockLedger ? { ok: stockLedger.driftCount === 0, driftCount: stockLedger.driftCount } : null,
      };
    }),
    // Same idea for search: staff can look up products/orders, but user
    // records (and thus any way to reach user management from a search hit)
    // are admin-only.
    search: anyStaffProcedure.input(z.object({ query: z.string().trim().min(1).max(120) })).query(async ({ ctx, input }) => {
      const result = await adminGlobalSearch(input.query);
      if (ctx.user.role === "admin") return result;
      return { ...result, users: [] };
    }),
    // Project "SUGI Desk" Phase 2 (2026-09-07): the first real field-level
    // permission in this codebase, not just a UI label -- costMnt's own
    // schema comment above (productWriteSchema) already said "Admin-only"
    // but staffProcedure here let staff read it regardless. Same redaction
    // shape as dashboardSummary/search above (full object for admin, nulled
    // field for staff), mirrored on the write side below so a stale/blank
    // form value from a staff session can never overwrite the real number.
    products: catalogReadProcedure.query(async ({ ctx }) => {
      const products = await getAdminProducts();
      if (ctx.user.role === "admin") return products;
      return products.map(product => ({ ...product, costMnt: null }));
    }),
    // Audit 2026-09-09 (R4): one product's full row for the editor -- the
    // list (admin.products) no longer carries description/galleryJson.
    productDetail: catalogReadProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const product = await getAdminProductDetail(input.id);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Бүтээгдэхүүн олдсонгүй." });
      return product;
    }),
    categories: catalogReadProcedure.query(() => getAdminCategories()),
    orders: ordersReadProcedure.query(() => getAdminOrders()),
    posts: contentReadProcedure.query(() => getAdminPosts()),
    postCategories: staffProcedure.query(() => getAdminPostCategories()),
    mediaLibrary: staffProcedure.input(z.object({ search: z.string().trim().max(120).optional(), page: z.number().int().positive().default(1) })).query(({ input }) => getAdminMediaLibrary(input)),
    siteMedia: marketingProcedure.query(() => getSiteMedia()),
    siteText: marketingProcedure.query(() => getSiteText()),
    storeSettings: marketingProcedure.query(() => getStoreSettings()),
    siteDocuments: marketingProcedure.query(() => getSiteDocuments()),
    loyaltyTiers: marketingProcedure.query(() => getAdminLoyaltyTiers()),
    // Audit 2026-09-09 (R4): server-side page + search (see getAdminUsers).
    users: usersReadProcedure.input(z.object({
      search: z.string().trim().max(120).optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }).optional()).query(({ input }) => getAdminUsers(input ?? {})),
    // 2026-09-05 ("admin invite staff section just change it to manually
    // only admin give staff role to default users" -- Tom, explicit): the
    // email-invitation flow (staffInvitations/inviteStaff/
    // revokeStaffInvitation, plus the invites.* router and /invite/:token
    // page) is gone. This is now the only way to grant staff/admin: pick an
    // existing registered user (already in the list below) and change their
    // role directly. See updateAdminUserRole's own comment in server/db.ts.
    updateUserRole: adminProcedure.input(z.object({ userId: z.number().int().positive(), role: staffRoleSchema })).mutation(async ({ ctx, input }) => {
      if (ctx.user.id === input.userId) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own administrator role here." });
      try {
        const updated = await updateAdminUserRole(input);
        await logAdminAction({ actorUserId: ctx.user.id, action: "user.role_updated", entityType: "user", entityId: input.userId, metadata: { role: input.role } });
        return updated;
      } catch (error) {
        throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "Unable to update user role." });
      }
    }),
    // 2026-09-11: which location a staff member works at -- a store
    // consultant can only receive goods or count stock there.
    updateUserBranch: adminProcedure.input(z.object({ userId: z.number().int().positive(), branchId: z.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => {
      try {
        const updated = await updateAdminUserBranch(input.userId, input.branchId);
        await logAdminAction({ actorUserId: ctx.user.id, action: "user.branch_updated", entityType: "user", entityId: input.userId, metadata: { branchId: input.branchId } });
        return updated;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Салбар оноож чадсангүй." });
      }
    }),
    // 2026-09-05: the admin-side half of "phone is now required for
    // everyone" (Tom's explicit choice) -- the account-recovery path for a
    // legacy account with no phone on file, or a mistyped one, since there
    // is no email fallback anymore. See updateAdminUserPhone's own comment
    // in server/db.ts for the full reasoning.
    updateUserPhone: adminProcedure.input(z.object({ userId: z.number().int().positive(), phone: phoneSchema.nullable() })).mutation(async ({ ctx, input }) => {
      const normalizedPhone = input.phone === null ? null : normalizePhoneForVerifyMn(input.phone);
      if (input.phone !== null && !normalizedPhone) throw new TRPCError({ code: "BAD_REQUEST", message: "Утасны дугаараа зөв оруулна уу." });
      try {
        const updated = await updateAdminUserPhone({ userId: input.userId, phone: normalizedPhone });
        await logAdminAction({ actorUserId: ctx.user.id, action: "user.phone_updated", entityType: "user", entityId: input.userId, metadata: { phone: normalizedPhone } });
        return updated;
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Утасны дугаарыг шинэчилж чадсангүй." });
      }
    }),
    userDetail: usersReadProcedure.input(z.object({ userId: z.number().int().positive() })).query(async ({ input }) => {
      const detail = await getAdminUserDetail(input.userId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      return detail;
    }),
    /**
     * Admin face gate (2026-09-08) — the per-user break-glass. Clears one
     * person's enrolled face so they re-enroll on their next /admin visit.
     *
     * This is the fix for "the gate is refusing to recognise ONE person"
     * (new glasses, a beard, a replaced webcam, a bad enrollment capture);
     * the ADMIN_FACE_GATE_ENABLED env switch is the fix for "the gate is
     * broken for everyone". Deliberately does not touch the password or the
     * session -- the account keeps working exactly as before, it just has to
     * enroll a face again.
     *
     * adminProcedure, not usersReadProcedure: clearing someone's second
     * factor is a security action, so it stays with the role that owns
     * accounts and roles rather than anyone who can merely read the user
     * list.
     */
    resetUserFaceEnrollment: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await deleteFaceEnrollment(input.userId);
      await logAdminAction({ actorUserId: ctx.user.id, action: "user.face_enrollment_reset", entityType: "user", entityId: input.userId });
      return { ok: true as const };
    }),
    /** Powers the Security Center's face-gate tab — the same role
     *  login_attempts data plays for password logins. adminProcedure to match
     *  loginHistory/auditLogs, which are already admin-only. */
    faceAttempts: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(500).optional(), userId: z.number().int().positive().optional() }).optional()).query(async ({ input }) => {
      return getFaceAttempts({ limit: input?.limit, userId: input?.userId });
    }),
    // PREMIUM-FEATURES.md TIER 5: bridges the physical-POS gap manually
    // (per Tom, 2026-08-25: no Smart POS API integration for now) — credits
    // a customer's known in-store lifetime spend onto their online total.
    updateUserLoyaltyAdjustment: adminProcedure.input(z.object({ userId: z.number().int().positive(), adjustmentMnt: z.number().int().min(0).max(1_000_000_000) })).mutation(async ({ ctx, input }) => {
      const detail = await updateUserLoyaltyAdjustment(input.userId, input.adjustmentMnt);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      await logAdminAction({ actorUserId: ctx.user.id, action: "user.loyalty_adjustment_updated", entityType: "user", entityId: input.userId, metadata: { adjustmentMnt: input.adjustmentMnt } });
      return detail;
    }),
    // "Controls everything" admin overhaul (2026-09-08, Phase H): real money
    // (a customer-service credit, not a percentage discount), same
    // financeProcedure tier as refundOrder -- unlike the loyalty-adjustment
    // bridge above (adminProcedure), issuing store credit is a financial
    // authorization decision, not a catalog/fulfilment one. Negative deltas
    // are allowed too (reversing a mistaken credit); adjustStoreCredit
    // itself rejects a delta that would take the balance below zero.
    adjustStoreCredit: financeProcedure.input(z.object({
      userId: z.number().int().positive(),
      deltaMnt: z.number().int().min(-1_000_000_000).max(1_000_000_000).refine(value => value !== 0, "Adjustment amount must not be zero."),
      reason: z.string().trim().min(1).max(300),
    })).mutation(async ({ ctx, input }) => {
      let result;
      try {
        result = await adjustStoreCredit({ userId: input.userId, deltaMnt: input.deltaMnt, reason: input.reason, actorUserId: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to adjust store credit." });
      }
      await logAdminAction({ actorUserId: ctx.user.id, action: "user.store_credit_adjusted", entityType: "user", entityId: input.userId, metadata: { deltaMnt: input.deltaMnt, reason: input.reason } });
      return result;
    }),
    storeCreditLedger: financeProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ input }) => getStoreCreditLedger(input.userId)),
    // Admin-manageable third-party provider config (eBarimt/StorePay/Golomt
    // card/eBuuhia courier) -- adminProcedure, not staffProcedure, since
    // these are financial/security-sensitive credentials. QPay isn't part
    // of this (still env-based, see server/qpay.ts).
    integrations: adminProcedure.query(() => getAdminIntegrations()),
    // 2026-09-11: merge-on-save. `config` is the old field name, still
    // accepted and treated as `set` so an older client cannot wipe settings.
    updateIntegration: adminProcedure.input(z.object({
      provider: z.enum(INTEGRATION_PROVIDERS),
      isActive: z.boolean().optional(),
      set: z.record(z.string().max(80), z.string().max(2_000)).optional(),
      clearKeys: z.array(z.string().max(80)).max(40).optional(),
      replaceAll: z.boolean().optional(),
      config: z.record(z.string().max(80), z.string().max(2_000)).optional(),
    })).mutation(async ({ ctx, input }) => {
      const set = { ...(input.config ?? {}), ...(input.set ?? {}) };
      let result;
      try {
        result = await updateAdminIntegration({ provider: input.provider, isActive: input.isActive, set, clearKeys: input.clearKeys, replaceAll: input.replaceAll }, ctx.user.id);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Тохиргоог хадгалж чадсангүй." });
      }
      // Key NAMES only, never values.
      await logAdminAction({ actorUserId: ctx.user.id, action: "integration.updated", entityType: "integration", metadata: { provider: input.provider, isActive: input.isActive, keysSet: Object.keys(set), keysCleared: input.clearKeys ?? [], replaceAll: Boolean(input.replaceAll) } });
      return result;
    }),
    // Checks one provider against the real service, right now, so an admin
    // can see it work before switching it on: ntfy sends one message to a
    // group's topic (not queued); Smart Software asks the vendor for its
    // location list, which is also what the branch mapping below needs.
    testIntegration: adminProcedure.input(z.discriminatedUnion("provider", [
      z.object({ provider: z.literal("ntfy"), group: z.enum(NOTIFICATION_GROUPS) }),
      z.object({ provider: z.literal("smartsoftware") }),
    ])).mutation(async ({ ctx, input }) => {
      if (input.provider === "smartsoftware") {
        const provider = await getInventorySyncProvider({ requireActive: false });
        const result = provider?.testConnection ? await provider.testConnection() : { ok: false, detail: "Нэвтрэх нэр, нууц үгээ оруулаад хадгална уу." };
        const locations = result.ok && provider?.listLocations ? await provider.listLocations().catch(() => []) : [];
        await logAdminAction({ actorUserId: ctx.user.id, action: "integration.tested", entityType: "integration", metadata: { provider: input.provider, ok: result.ok } });
        return { ok: result.ok, status: null, error: result.ok ? null : result.detail, detail: result.detail, locations };
      }
      const result = await sendNtfyTest(input.group, { ...buildNotificationMessage("integration.test", { groupLabel: NOTIFICATION_GROUP_LABELS[input.group] }), priority: 3, tags: ["bell"] });
      await logAdminAction({ actorUserId: ctx.user.id, action: "integration.tested", entityType: "integration", metadata: { provider: input.provider, group: input.group, ok: result.ok, status: result.status } });
      return { ok: result.ok, status: result.status, error: result.error, detail: result.error ?? "Илгээлээ.", locations: [] as { id: string; name: string }[] };
    }),
    // A long random topic generated on the server (never typed in, never
    // guessable). Also how a topic is ROTATED when a staff member leaves:
    // everyone still in the group re-scans the new QR code.
    generateNtfyTopic: adminProcedure.input(z.object({ group: z.enum(NOTIFICATION_GROUPS) })).mutation(async ({ ctx, input }) => {
      const topic = `sugi-${input.group}-${randomBytes(15).toString("base64url")}`;
      const result = await updateAdminIntegration({ provider: "ntfy", set: { [NTFY_TOPIC_FIELD[input.group]]: topic } }, ctx.user.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "integration.ntfy_topic_generated", entityType: "integration", metadata: { group: input.group } });
      return result;
    }),
    // Which .env-configured services are set up -- yes/no only, never a
    // value. Before this, the Integrations screen showed only QPay, so
    // "is SMS verification / error tracking / storage configured?" meant
    // opening the server's .env.
    envIntegrationStatus: adminProcedure.query(async () => {
      const storage = await storagePing().catch(error => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return [
        { key: "brevo", label: "Brevo имэйл", configured: Boolean(ENV.brevoApiKey && ENV.brevoSenderEmail), note: "Захиалгын имэйл, нууц үг сэргээх" },
        { key: "smsCampaigns", label: "Масс SMS кампанит ажил", configured: ENV.smsCampaignsEnabled, note: "SMS_CAMPAIGNS_ENABLED=1 үед л асна" },
        { key: "verifyMn", label: "verify.mn утас баталгаажуулалт", configured: Boolean(ENV.verifyMnApiKey), note: "Бүртгэл, нууц үг сэргээх" },
        { key: "qpay", label: "QPay төлбөр", configured: getQPayAvailability().configured, note: "Онлайн төлбөр" },
        { key: "storage", label: "Cloudflare R2 зургийн сан", configured: storage.ok, note: storage.ok ? "Холбогдож байна" : "Холбогдсонгүй" },
        { key: "honeybadger", label: "Honeybadger алдааны хяналт", configured: Boolean(ENV.honeybadgerApiKey), note: "Алдаа илгээх түлхүүр" },
        { key: "honeybadgerRead", label: "Honeybadger алдаа унших", configured: Boolean(ENV.honeybadgerPersonalAuthToken), note: "Аюулгүй байдал хэсэгт алдааг харуулна" },
        { key: "publicBaseUrl", label: "Сайтын нийтийн хаяг", configured: Boolean(ENV.publicBaseUrl), note: "PUBLIC_BASE_URL -- QPay callback, мэдэгдэл дээр дарахад нээгдэх холбоос" },
        { key: "encryptionKey", label: "Тохиргооны шифрлэлтийн түлхүүр", configured: /^[0-9a-f]{64}$/i.test(ENV.integrationsEncryptionKey), note: "Энэ хуудсан дээрх нууц утгуудыг хамгаална" },
        { key: "databaseCa", label: "Өгөгдлийн сангийн сертификат", configured: Boolean(process.env.DATABASE_CA_CERT || process.env.DATABASE_CA_CERT_PATH), note: "Aiven-ий TLS сертификатыг шалгана" },
        { key: "faceGate", label: "Царайгаар нэвтрэх шалгалт", configured: ENV.adminFaceGateEnabled, note: "ADMIN_FACE_GATE_ENABLED=1" },
        { key: "notificationsDispatch", label: "Мэдэгдэл илгээгч (энэ сервер)", configured: ENV.notificationsDispatchEnabled, note: "NOTIFICATIONS_DISPATCH=1 тохируулсан машин л утас руу илгээнэ" },
      ];
    }),
    notificationOutbox: adminProcedure.query(() => getRecentNotificationOutbox(50)),
    // Phase 6 (2026-09-11): the Smart Software sync seam -- stream status,
    // and each branch's store code in Smart POS (server/integrations/inventorySync.ts).
    inventorySyncStatus: adminProcedure.query(() => getInventorySyncStatus()),
    setBranchExternalId: adminProcedure.input(z.object({ branchId: z.number().int().positive(), externalId: z.string().trim().max(120).nullable() })).mutation(async ({ ctx, input }) => {
      try {
        const result = await setBranchExternalId(input.branchId, input.externalId);
        await logAdminAction({ actorUserId: ctx.user.id, action: "integration.branch_code_set", entityType: "branch", entityId: input.branchId, metadata: { provider: "smartsoftware", externalId: input.externalId } });
        return result;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Кодыг хадгалж чадсангүй." });
      }
    }),
    runInventorySync: adminProcedure.mutation(async ({ ctx }) => {
      const result = await runInventorySync();
      await logAdminAction({ actorUserId: ctx.user.id, action: "integration.sync_run", entityType: "integration", metadata: { provider: "smartsoftware", ran: result.ran } });
      return result;
    }),
    // "Pull stock now": reads the vendor's figures and files a stocktake per
    // mapped branch for warehouse/admin approval. Works while the
    // integration is still switched off, so the mapping can be checked
    // before the 15-minute job starts running on its own. Never writes stock.
    pullVendorStock: adminProcedure.mutation(async ({ ctx }) => {
      const provider = await getInventorySyncProvider({ requireActive: false });
      if (!provider) throw new TRPCError({ code: "BAD_REQUEST", message: "Smart Software-ийн нэвтрэх нэр, нууц үгээ оруулаад хадгална уу." });
      let result;
      try {
        result = await runPullSnapshot(provider);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Үлдэгдэл татаж чадсангүй." });
      }
      await logAdminAction({ actorUserId: ctx.user.id, action: "integration.stock_pulled", entityType: "integration", metadata: { provider: "smartsoftware", counts: result.ran ? result.branches.filter(branch => branch.countId).length : 0 } });
      return result;
    }),
    // Sales/customer/district analytics for the people running the
    // business -- adminProcedure like Security Center/Integrations
    // (revenue + customer data, not everyday staff-level). Note this is
    // order-based ("who bought"), not website-traffic-based ("who
    // browsed") -- the app has no page-view/visit tracking infrastructure
    // today, see the comment on getDistrictBreakdown in server/analytics.ts.
    analyticsReport: financeProcedure.input(z.object({
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    })).query(({ input }) => getAnalyticsReport({ dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined, dateTo: input.dateTo ? new Date(input.dateTo) : undefined })),
    // 2026-09-08 (reference-driven admin redesign): the dashboard's two
    // ranked cards. financeProcedure, same tier as analyticsReport below --
    // it's revenue-ranked product data plus named customers, not
    // operational staff data, so staff sees the locked-card treatment
    // rather than a network 403.
    dashboardHighlights: financeProcedure.input(z.object({
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    })).query(({ input }) => getDashboardHighlights({ dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined, dateTo: input.dateTo ? new Date(input.dateTo) : undefined })),
    analyticsExport: financeProcedure.input(z.object({
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      format: z.enum(["xlsx", "pdf"]),
    })).mutation(async ({ ctx, input }) => {
      const range = { dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined, dateTo: input.dateTo ? new Date(input.dateTo) : undefined };
      const report = await getAnalyticsReport(range);
      const buffer = input.format === "xlsx" ? await exportAnalyticsExcel(report, range) : await exportAnalyticsPdf(report, range);
      await logAdminAction({ actorUserId: ctx.user.id, action: "analytics.exported", entityType: "analytics", metadata: { format: input.format } });
      const mimeType = input.format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf";
      return { filename: `sugi-analytics-${new Date().toISOString().slice(0, 10)}.${input.format}`, mimeType, dataBase64: buffer.toString("base64") };
    }),
    // Tier F: CAC's one input, entered per calendar month. A financial
    // figure -- adminProcedure, same tier as analyticsReport.
    marketingSpend: financeProcedure.input(z.object({
      monthKeys: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1).max(24),
    })).query(({ input }) => getMarketingSpendRows(input.monthKeys)),
    updateMarketingSpend: financeProcedure.input(z.object({
      monthKey: z.string().regex(/^\d{4}-\d{2}$/),
      spendMnt: z.number().int().min(0).max(1_000_000_000),
    })).mutation(async ({ ctx, input }) => {
      const result = await upsertMarketingSpend({ ...input, updatedByUserId: ctx.user.id });
      await logAdminAction({ actorUserId: ctx.user.id, action: "marketing_spend.updated", entityType: "marketing_spend", metadata: { monthKey: input.monthKey, spendMnt: input.spendMnt } });
      return result;
    }),
    // Admin overhaul (2026-09-08, Phase I): analyticsReport above (now
    // finance-only) already bundles preferenceSegments/recommendationCoverage
    // into its one big response -- marketing needs just this slice, not the
    // rest of the financial report, so this is a standalone procedure
    // calling the same two underlying functions again (a cheap, harmless
    // duplication) rather than redacting ~15 unrelated fields out of the
    // shared response.
    customerSegments: marketingProcedure.query(async () => {
      const [preferenceSegments, recommendationCoverage] = await Promise.all([getPreferenceSegmentBreakdown(), getRecommendationCoverage()]);
      return { preferenceSegments, recommendationCoverage };
    }),
    // The drill-down behind one of customerSegments' aggregate counts --
    // real customer PII (name/phone/email), a deliberate, Tom-confirmed
    // scope expansion for marketing (needed to actually target a campaign,
    // see Phase J) that this role didn't have before this overhaul.
    usersBySegment: marketingProcedure.input(z.object({
      field: z.enum(["gender", "skinType", "skinConcerns", "hairType", "primaryDistrict", "hasYoungChildren"]),
      value: z.string().trim().max(60),
    })).query(({ input }) => getUsersBySegment(input.field as PreferenceSegmentField, input.value)),
    // Admin overhaul (2026-09-08, Phase J): the campaign composer's other two
    // targeting sources (the third, segment drill-down, is usersBySegment
    // just above).
    campaignAllUsers: marketingProcedure.query(() => getAllCustomersForCampaign()),
    campaignUsersByLoyaltyTier: marketingProcedure.input(z.object({ tierName: z.string().trim().min(1).max(40) })).query(({ input }) => getUsersByLoyaltyTier(input.tierName)),
    // The actual send. Always an explicit, already-resolved userIds[] (never
    // a server-side "resolve this filter at send time") -- what the composer
    // previewed is exactly who gets messaged, no race between preview and
    // send. Filters by emailOptIn/smsOptIn before sending -- these columns
    // exist but (per their own schema comment) were only ever enforced for
    // the back-in-stock alert until now; this is the first real enforcement
    // point beyond that one case. SMS is gated behind ENV.smsCampaignsEnabled
    // (a separate flag from the Brevo key sendAccountSms already technically
    // works with) since Tom has not confirmed SMS credits/route are set up.
    sendCampaign: marketingProcedure.input(z.object({
      userIds: z.array(z.number().int().positive()).min(1).max(2_000),
      channel: z.enum(["email", "sms"]),
      subject: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(5_000),
      sourceLabel: z.string().trim().max(120).optional(),
    })).mutation(async ({ ctx, input }) => {
      if (input.channel === "sms" && !ENV.smsCampaignsEnabled) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SMS кампанит ажил идэвхжээгүй байна. Тохиргоог админтай холбогдоно уу." });
      }
      // 2026-09-12 audit: a double click, a retried request or a second tab
      // used to send the whole campaign twice -- up to 2,000 people, each
      // getting the same SMS at 150₮ a message. The same recipients + same
      // text within ten minutes is refused; the fingerprint is kept on the
      // audit row, so this holds across both laptops (an in-memory guard
      // would not).
      const fingerprint = createHash("sha256").update(`${input.channel}|${input.subject}|${input.body}|${[...input.userIds].sort((a, b) => a - b).join(",")}`).digest("hex").slice(0, 32);
      const recent = await findRecentCampaignSend(fingerprint, 10);
      if (recent) {
        const minutesAgo = Math.max(1, Math.round((Date.now() - recent.createdAt.getTime()) / 60_000));
        throw new TRPCError({ code: "CONFLICT", message: `Яг энэ кампанит ажлыг ${minutesAgo} минутын өмнө аль хэдийн илгээсэн байна. Дахин илгээх бол 10 минутын дараа оролдоно уу.` });
      }
      const recipients = await getUsersForCampaignSend(input.userIds);
      const eligible = recipients.filter(user => input.channel === "email" ? user.emailOptIn && Boolean(user.email) : user.smsOptIn && Boolean(user.phone));

      let sentCount = 0;
      let failedCount = 0;
      const BATCH_SIZE = 20;
      for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
        const batch = eligible.slice(i, i + BATCH_SIZE);
        const outcomes = await Promise.all(batch.map(user => input.channel === "email"
          ? sendAccountEmail({ to: user.email!, subject: input.subject, content: input.body })
          : sendAccountSms({ to: user.phone!, content: input.body })));
        sentCount += outcomes.filter(Boolean).length;
        failedCount += outcomes.filter(ok => !ok).length;
      }

      const skippedOptOutCount = recipients.length - eligible.length;
      await logAdminAction({
        actorUserId: ctx.user.id,
        action: "campaign.sent",
        entityType: "campaign",
        metadata: { fingerprint, source: input.sourceLabel ?? null, channel: input.channel, recipientCount: input.userIds.length, eligibleCount: eligible.length, skippedOptOutCount, subject: input.subject, sentCount, failedCount },
      });
      return { recipientCount: input.userIds.length, eligibleCount: eligible.length, skippedOptOutCount, sentCount, failedCount };
    }),
    // Lets the composer disable/explain the SMS channel client-side instead
    // of only failing after the admin has already filled out a message --
    // ENV.smsCampaignsEnabled itself is server-only config, not something
    // the client can read directly.
    campaignConfig: marketingProcedure.query(() => ({ smsCampaignsEnabled: ENV.smsCampaignsEnabled })),
    suspendUser: adminProcedure.input(z.object({ userId: z.number().int().positive(), reason: z.string().trim().max(300).optional() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.id === input.userId) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot suspend your own account." });
      try {
        const updated = await suspendUser(input);
        await logAdminAction({ actorUserId: ctx.user.id, action: "user.suspended", entityType: "user", entityId: input.userId, metadata: { reason: input.reason ?? null } });
        return updated;
      } catch (error) {
        throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "Unable to suspend this user." });
      }
    }),
    unsuspendUser: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        const updated = await unsuspendUser(input.userId);
        await logAdminAction({ actorUserId: ctx.user.id, action: "user.unsuspended", entityType: "user", entityId: input.userId });
        return updated;
      } catch (error) {
        throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "Unable to unsuspend this user." });
      }
    }),
    forceLogoutUser: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await bumpUserSessionVersion(input.userId);
      await logAdminAction({ actorUserId: ctx.user.id, action: "user.force_logout", entityType: "user", entityId: input.userId });
      return { success: true } as const;
    }),
    // TIER 4, admin-only (same tier as user management — this is exactly the
    // kind of data staff shouldn't see): who did what, and who's been
    // trying to log in.
    // Phase L: cached 30s per distinct filter combination -- this tab is
    // read far more often than admin actions actually happen, and a 30s-old
    // audit log is never urgent (nothing here is a live-incident view). The
    // cache key includes every filter param so switching filters can never
    // return a different filter's stale result.
    auditLogs: adminProcedure.input(z.object({
      action: z.string().trim().max(100).optional(),
      actorEmail: z.string().trim().max(320).optional(),
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
      limit: z.number().int().positive().max(200).optional(),
    })).query(({ input }) => getOrSetCached(
      `auditLogs:${input.action ?? ""}|${input.actorEmail ?? ""}|${input.dateFrom?.toISOString() ?? ""}|${input.dateTo?.toISOString() ?? ""}|${input.limit ?? ""}`,
      30_000,
      () => getAdminAuditLogs({
        action: input.action || undefined,
        actorEmail: input.actorEmail || undefined,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        limit: input.limit,
      }),
    )),
    // Project "SUGI Desk" Phase 4 (2026-09-07): per-record Activity/History
    // -- Frappe's Timeline concept, built on the exact same audit log the
    // global viewer above already reads, just scoped to one record. Same
    // admin-only tier as auditLogs (this reveals which staff member did
    // what, same sensitivity), surfaced as a "History" panel on individual
    // Product/Order edit screens rather than a full-page log.
    entityHistory: adminProcedure.input(z.object({
      entityType: z.string().trim().min(1).max(60),
      entityId: z.number().int().positive(),
    })).query(({ input }) => getAdminAuditLogs({ entityType: input.entityType, entityId: input.entityId, limit: 50 })),
    // Phase M: real server-side pagination -- login_attempts keeps every
    // attempt forever (no retention job), so a flat limit made everything
    // past it permanently invisible in the UI even though it still exists.
    loginHistory: adminProcedure.input(z.object({
      email: z.string().trim().max(320).optional(),
      outcome: z.enum(["all", "success", "failed"]).default("all"),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(200).default(50),
    })).query(({ input }) => getOrSetCached(
      `loginHistory:${input.email ?? ""}|${input.outcome}|${input.page}|${input.pageSize}`,
      30_000,
      () => getLoginHistory({
        email: input.email || undefined,
        success: input.outcome === "success" ? true : input.outcome === "failed" ? false : undefined,
        page: input.page,
        pageSize: input.pageSize,
      }),
    )),
    // Project "SUGI Desk" Phase 7 (2026-09-07): the third tab of "unified
    // System Logs" -- Honeybadger's own error feed, read back into the admin
    // panel via server/_core/honeybadgerReadApi.ts. Same admin-only tier as
    // the two tabs above (`configured: false` when no personal auth token is
    // set, never an error -- see that file's own doc comment).
    // Phase L: 60s TTL, longer than the other 3 tabs -- this is the one
    // that leaves the process (a real Honeybadger API call), not just a
    // local DB/memory read.
    honeybadgerFaults: adminProcedure.query(() => getOrSetCached("honeybadgerFaults", 60_000, () => listRecentHoneybadgerFaults())),
    // Phase K: the 4th Security Center tab -- an in-process ring buffer, not
    // a real DB-side query log (see server/_core/sqlQueryLog.ts).
    recentSqlQueries: adminProcedure.query(() => getOrSetCached("recentSqlQueries", 30_000, () => Promise.resolve(getRecentSqlQueries()))),
    updateOrder: warehouseProcedure.input(orderUpdateSchema).mutation(async ({ ctx, input }) => {
      let order;
      try {
        order = await updateAdminOrder({ ...input, actorUserId: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to update order." });
      }
      await logAdminAction({ actorUserId: ctx.user.id, action: "order.updated", entityType: "order", entityId: order.id, metadata: { status: order.status, deliveryTrackingRef: order.deliveryTrackingRef } });
      // Only notify when this call actually changed the status — editing
      // just the tracking ref/admin note shouldn't re-announce whatever
      // status the order already had.
      if (input.status !== undefined) {
        try {
          await sendOrderStatusUpdateEmail(order);
        } catch (error) {
          console.error("[admin.updateOrder] Failed to send status update email", error);
        }
      }
      return order;
    }),
    // TIER 5: bulk status change. Re-runs the exact same per-order rules as
    // updateOrder (can't move backward, can't touch a closed order) for each
    // id individually — one bad id in the batch (e.g. already completed)
    // fails only that one and doesn't block the rest.
    bulkUpdateOrderStatus: warehouseProcedure.input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(200),
      status: orderStatusSchema,
    })).mutation(async ({ ctx, input }) => {
      const succeeded: number[] = [];
      const failed: { id: number; message: string }[] = [];
      for (const id of input.ids) {
        try {
          const order = await updateAdminOrder({ id, status: input.status, actorUserId: ctx.user.id });
          await logAdminAction({ actorUserId: ctx.user.id, action: "order.updated", entityType: "order", entityId: order.id, metadata: { status: order.status, bulk: true } });
          succeeded.push(id);
          try {
            await sendOrderStatusUpdateEmail(order);
          } catch (notifyError) {
            console.error("[admin.bulkUpdateOrderStatus] Failed to send status update email", notifyError);
          }
        } catch (error) {
          failed.push({ id, message: error instanceof Error ? error.message : "Unable to update order." });
        }
      }
      return { succeeded, failed };
    }),
    // Admin overhaul (2026-09-08, Phase E): financeProcedure, not
    // warehouseProcedure like updateOrder above -- recording a refund is a
    // money decision, distinct from moving an order through fulfilment.
    refundOrder: financeProcedure.input(z.object({
      id: z.number().int().positive(),
      refundAmountMnt: z.number().int().min(0),
      refundNote: z.string().trim().max(300).optional(),
      restockItems: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      let order;
      try {
        order = await refundOrder({ id: input.id, refundAmountMnt: input.refundAmountMnt, refundNote: input.refundNote ?? null, restockItems: input.restockItems, actorUserId: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to refund order." });
      }
      await logAdminAction({ actorUserId: ctx.user.id, action: "order.refunded", entityType: "order", entityId: order.id, metadata: { refundAmountMnt: order.refundAmountMnt, restockItems: input.restockItems } });
      return order;
    }),
    createPost: staffProcedure.input(postWriteSchema).mutation(async ({ ctx, input }) => {
      await validatePostSlug(input.slug);
      const post = await createAdminPost({ ...input, createdByUserId: ctx.user.id });
      await logAdminAction({ actorUserId: ctx.user.id, action: "post.created", entityType: "post", entityId: post.id, metadata: { slug: post.slug, published: post.isPublished } });
      return post;
    }),
    updatePost: staffProcedure.input(postUpdateSchema).mutation(async ({ ctx, input }) => {
      await validatePostSlug(input.slug, input.id);
      const post = await updateAdminPost(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "post.updated", entityType: "post", entityId: post.id, metadata: { slug: post.slug, published: post.isPublished } });
      return post;
    }),
    // 2026-09-07: replaced the old one-click hard `deletePost` with
    // WordPress's real 3-state Trash/Restore/"Delete Permanently" flow.
    trashPost: staffProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await trashAdminPost(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "post.trashed", entityType: "post", entityId: input.id });
      return result;
    }),
    restorePost: staffProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await restoreAdminPost(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "post.restored", entityType: "post", entityId: input.id });
      return result;
    }),
    permanentlyDeletePost: staffProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await permanentlyDeleteAdminPost(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "post.permanentlyDeleted", entityType: "post", entityId: input.id });
      return result;
    }),
    createPostCategory: staffProcedure.input(postCategoryWriteSchema).mutation(async ({ ctx, input }) => {
      await validatePostCategoryName(input.name);
      const category = await createAdminPostCategory(input.name);
      await logAdminAction({ actorUserId: ctx.user.id, action: "postCategory.created", entityType: "postCategory", entityId: category.id, metadata: { name: category.name } });
      return category;
    }),
    // NEWVISION.md §5 "Топ брэндүүд" -- same staffProcedure weight as
    // Posts/Discount Codes (Tom's explicit correction to the original plan,
    // which had omitted a Brands admin section entirely).
    featuredBrands: marketingProcedure.query(() => getAdminFeaturedBrands()),
    distinctRealBrands: marketingProcedure.query(() => getDistinctRealBrands()),
    createFeaturedBrand: marketingProcedure.input(featuredBrandWriteSchema).mutation(async ({ ctx, input }) => {
      const brand = await createFeaturedBrand(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "featuredBrand.created", entityType: "featuredBrand", entityId: brand.id, metadata: { brandName: brand.brandName } });
      return brand;
    }),
    updateFeaturedBrand: marketingProcedure.input(featuredBrandUpdateSchema).mutation(async ({ ctx, input }) => {
      const brand = await updateFeaturedBrand(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "featuredBrand.updated", entityType: "featuredBrand", entityId: brand.id, metadata: { brandName: brand.brandName } });
      return brand;
    }),
    deleteFeaturedBrand: marketingProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteFeaturedBrand(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "featuredBrand.deleted", entityType: "featuredBrand", entityId: input.id });
      return result;
    }),
    // "Controls everything" admin overhaul (2026-09-08, Phase J). Same
    // marketingProcedure weight and CRUD shape as featuredBrands above --
    // branches are storefront-facing merchandising/logistics data, not a
    // financial or fulfilment-write decision (Phase L's actual stock
    // decrements stay warehouseProcedure-gated separately).
    branches: marketingProcedure.query(() => getAdminBranches()),
    createBranch: marketingProcedure.input(branchWriteSchema).mutation(async ({ ctx, input }) => {
      assertBranchStockFieldsAllowed(ctx.user.role, input, true);
      let branch;
      try {
        branch = await createBranch(input);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Салбар үүсгэж чадсангүй." });
      }
      await logAdminAction({ actorUserId: ctx.user.id, action: "branch.created", entityType: "branch", entityId: branch.id, metadata: { name: branch.name } });
      return branch;
    }),
    updateBranch: marketingProcedure.input(branchUpdateSchema).mutation(async ({ ctx, input }) => {
      assertBranchStockFieldsAllowed(ctx.user.role, input, false);
      let branch;
      try {
        branch = await updateBranch(input);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Салбарыг шинэчилж чадсангүй." });
      }
      await logAdminAction({ actorUserId: ctx.user.id, action: "branch.updated", entityType: "branch", entityId: branch.id, metadata: { name: branch.name } });
      return branch;
    }),
    deleteBranch: marketingProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      let result;
      try {
        result = await deleteBranch(input.id);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Салбарыг устгаж чадсангүй." });
      }
      await logAdminAction({ actorUserId: ctx.user.id, action: "branch.deleted", entityType: "branch", entityId: input.id });
      return result;
    }),
    createProduct: warehouseProcedure.input(productWriteSchema).mutation(async ({ ctx, input }) => {
      // costMnt is admin-only (see the schema comment above) -- a staff
      // session never even sees the real value (products query redacts it
      // to null above), so it can never legitimately submit one either.
      // Force-strip rather than trust the client to have omitted it.
      if (ctx.user.role !== "admin") input.costMnt = null;
      await validateProductWrite(input);
      const product = await createAdminProduct(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "product.created", entityType: "product", entityId: product.id, metadata: { slug: product.slug, published: product.isPublished } });
      return product;
    }),
    updateProduct: warehouseProcedure.input(productUpdateSchema).mutation(async ({ ctx, input }) => {
      // This is a PARTIAL update -- `delete`, not `= null`, so an omitted
      // costMnt means "leave the existing value alone" rather than "wipe
      // it to null." A staff session's product form always has costMnt
      // blank (the query above redacts it), so without this, any ordinary
      // edit by staff would silently erase whatever admin had set.
      if (ctx.user.role !== "admin") delete input.costMnt;
      await validateProductWrite(input);
      // Snapshot stock before the write so a 0 -> >0 restock can be
      // detected below and fire wishlist "Ирэхээр мэдэгдэх" alerts.
      const stockBefore = input.stockQuantity !== undefined ? await getProductStockQuantity(input.id) : null;
      const product = await updateAdminProduct(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "product.updated", entityType: "product", entityId: product.id, metadata: { slug: product.slug, published: product.isPublished } });
      if (stockBefore === 0 && product.stockQuantity > 0) {
        const watchers = await getWishlistWatchersForProduct(product.id);
        for (const watcher of watchers) {
          // 2026-09-05: users.email is nullable now (phone-only accounts) --
          // a watcher with no email on file simply can't get this alert by
          // email; there's no SMS equivalent for this notification yet.
          if (!watcher.emailOptIn || !watcher.email) continue;
          // No absolute site URL is configured anywhere in this app yet (see
          // ENV in server/_core/env.ts) — every other transactional email is
          // plain text with no link for the same reason, so this follows
          // suit rather than hard-coding a guessed production domain.
          const backInStockTokens = { "{бараа}": product.name };
          await sendAccountEmail({
            to: watcher.email,
            subject: fillTemplate(await getStoreSettingValue("email-subject-back-in-stock"), backInStockTokens),
            content: fillTemplate(await getStoreSettingValue("email-body-back-in-stock"), backInStockTokens),
          });
        }
        if (watchers.length) await clearWishlistNotifyFlagsForProduct(product.id);
      }
      return product;
    }),
    deleteProduct: warehouseProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminProduct(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "product.deleted", entityType: "product", entityId: input.id });
      return result;
    }),
    // Product variants -- PHASE 1 (additive only, see the long comment on
    // productVariants in drizzle/schema.ts). Nothing in cart/checkout/orders
    // reads this table yet.
    productVariants: warehouseProcedure.input(z.object({ productId: z.number().int().positive() })).query(({ input }) => getAdminProductVariants(input.productId)),
    createProductVariant: warehouseProcedure.input(productVariantWriteSchema).mutation(async ({ ctx, input }) => {
      if (await variantSkuExists(input.sku)) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ SKU/баркод өмнө нь ашиглагдсан байна." });
      const variants = await createAdminProductVariant(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "product_variant.created", entityType: "product", entityId: input.productId, metadata: { sku: input.sku } });
      return variants;
    }),
    updateProductVariant: warehouseProcedure.input(productVariantUpdateSchema).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      if (changes.sku && await variantSkuExists(changes.sku, id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ SKU/баркод өмнө нь ашиглагдсан байна." });
      const variants = await updateAdminProductVariant({ id, ...changes });
      await logAdminAction({ actorUserId: ctx.user.id, action: "product_variant.updated", entityType: "product", entityId: id });
      return variants;
    }),
    deleteProductVariant: warehouseProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        const result = await deleteAdminProductVariant(input.id);
        await logAdminAction({ actorUserId: ctx.user.id, action: "product_variant.deleted", entityType: "product", entityId: input.id });
        return result;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Variant устгаж чадсангүй." });
      }
    }),
    // "Controls everything" admin overhaul (2026-09-08, Phase L): the
    // per-branch stock editor -- same warehouseProcedure weight as the
    // variant endpoints above (stock-keeping, not a merchandising or
    // financial decision).
    branchStock: warehouseProcedure.input(z.object({ variantId: z.number().int().positive() })).query(({ input }) => getBranchStockForVariant(input.variantId)),
    // 2026-09-11: `note` (why the count changed) goes onto the stock ledger
    // movement next to the before/after numbers.
    setBranchStock: warehouseProcedure.input(z.object({ branchId: z.number().int().positive(), variantId: z.number().int().positive(), quantity: z.number().int().min(0), note: z.string().trim().max(300).optional() })).mutation(async ({ ctx, input }) => {
      const result = await setBranchStock(input.branchId, input.variantId, input.quantity, { actorUserId: ctx.user.id, note: input.note || null });
      await logAdminAction({ actorUserId: ctx.user.id, action: "branchStock.updated", entityType: "product_variant", entityId: input.variantId, metadata: { branchId: input.branchId, quantity: input.quantity, note: input.note ?? null } });
      return result;
    }),
    // The stock ledger for one variant (2026-09-11): every change to every
    // branch's shelf, who made it and why.
    stockMovements: warehouseProcedure.input(z.object({ variantId: z.number().int().positive() })).query(({ input }) => getStockMovementsForVariant(input.variantId)),
    // "Controls everything" admin overhaul (2026-09-08, Phase M): the POS
    // in-person-sale tool. Same warehouseProcedure weight as the stock
    // endpoints above -- recording a sale is stock-adjacent, not a
    // merchandising or financial-policy decision (admin can too).
    posSearchVariants: warehouseProcedure.input(z.object({ branchId: z.number().int().positive(), search: z.string().trim().max(120).default("") })).query(({ input }) => searchVariantsForBranch(input.branchId, input.search)),
    recordInStoreSale: warehouseProcedure.input(z.object({
      branchId: z.number().int().positive(),
      items: z.array(z.object({ variantId: z.number().int().positive(), quantity: z.number().int().min(1).max(1_000) })).min(1).max(50),
      userId: z.number().int().positive().nullable().optional(),
      customerName: nullableText(160),
      customerPhone: nullableText(40),
      clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
    })).mutation(async ({ ctx, input }) => {
      let order;
      try {
        order = await recordInStoreSale({ ...input, actorUserId: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to record this sale." });
      }
      if (order.replayed) return order;
      await logAdminAction({ actorUserId: ctx.user.id, action: "pos.sale_recorded", entityType: "order", entityId: order.id, metadata: { branchId: input.branchId, totalMnt: order.totalMnt, itemCount: input.items.length } });
      return order;
    }),
    // PREMIUM-FEATURES.md TIER 2: lightweight moderation — a flat list an
    // admin/staff can filter through, not a pre-publish approval queue
    // (reviews are already gated by verified purchase before this).
    reviews: marketingProcedure.query(() => getAdminReviews()),
    updateReviewApproval: marketingProcedure.input(z.object({ id: z.number().int().positive(), isApproved: z.boolean() })).mutation(async ({ ctx, input }) => {
      const result = await setReviewApproval(input.id, input.isApproved);
      await logAdminAction({ actorUserId: ctx.user.id, action: input.isApproved ? "review.approved" : "review.hidden", entityType: "review", entityId: input.id });
      return result;
    }),
    deleteReview: marketingProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminReview(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "review.deleted", entityType: "review", entityId: input.id });
      return result;
    }),
    // 2026-09-13: edit a review's text/rating, and manage its replies.
    updateReview: marketingProcedure
      .input(z.object({ id: z.number().int().positive(), rating: z.number().int().min(1).max(5).optional(), comment: z.string().trim().max(2_000).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await updateAdminReview({ id: input.id, rating: input.rating, comment: input.comment === undefined ? undefined : (input.comment || null) });
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Сэтгэгдэл олдсонгүй." });
        await logAdminAction({ actorUserId: ctx.user.id, action: "review.edited", entityType: "review", entityId: input.id });
        return result;
      }),
    reviewReplies: marketingProcedure.input(z.object({ reviewId: z.number().int().positive() })).query(({ input }) => getAdminReviewReplies(input.reviewId)),
    updateReviewReply: marketingProcedure
      .input(z.object({ id: z.number().int().positive(), body: z.string().trim().min(1).max(2_000).optional(), isApproved: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await updateAdminReviewReply(input);
        await logAdminAction({ actorUserId: ctx.user.id, action: "review.reply.edited", entityType: "review_reply", entityId: input.id });
        return result;
      }),
    deleteReviewReply: marketingProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminReviewReply(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "review.reply.deleted", entityType: "review_reply", entityId: input.id });
      return result;
    }),
    // PREMIUM-FEATURES.md TIER 4.
    routines: marketingProcedure.query(() => getAdminRoutines()),
    routineDetail: marketingProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => getAdminRoutineDetail(input.id)),
    createRoutine: marketingProcedure.input(routineWriteSchema).mutation(async ({ ctx, input }) => {
      if (await routineSlugExists(input.slug)) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ slug өмнө нь ашиглагдсан байна." });
      const routine = await createAdminRoutine(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "routine.created", entityType: "routine", entityId: routine.id, metadata: { slug: routine.slug } });
      return routine;
    }),
    updateRoutine: marketingProcedure.input(routineUpdateSchema).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      if (changes.slug && await routineSlugExists(changes.slug, id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ slug өмнө нь ашиглагдсан байна." });
      const routine = await updateAdminRoutine({ id, ...changes });
      await logAdminAction({ actorUserId: ctx.user.id, action: "routine.updated", entityType: "routine", entityId: id });
      return routine;
    }),
    deleteRoutine: marketingProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminRoutine(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "routine.deleted", entityType: "routine", entityId: input.id });
      return result;
    }),
    setRoutineSteps: marketingProcedure.input(z.object({ routineId: z.number().int().positive(), steps: z.array(routineStepInputSchema).min(1).max(20) })).mutation(async ({ ctx, input }) => {
      try {
        const result = await setRoutineSteps(input.routineId, input.steps);
        await logAdminAction({ actorUserId: ctx.user.id, action: "routine.steps_updated", entityType: "routine", entityId: input.routineId, metadata: { stepCount: input.steps.length } });
        return result;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Алхмуудыг хадгалж чадсангүй." });
      }
    }),
    // Marketing popup/banner (new-arrival, sale, store event announcement).
    promotions: contentReadProcedure.query(() => getAdminSitePromotions()),
    createPromotion: marketingProcedure.input(promotionWriteSchema).mutation(async ({ ctx, input }) => {
      const promotion = await createAdminSitePromotion({ ...input, message: input.message ?? null, imageUrl: input.imageUrl ?? null, ctaLabel: input.ctaLabel ?? null, ctaUrl: input.ctaUrl ?? null, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null }, ctx.user.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "promotion.created", entityType: "promotion", entityId: promotion.id, metadata: { headline: promotion.headline, isActive: promotion.isActive } });
      return promotion;
    }),
    updatePromotion: marketingProcedure.input(promotionUpdateSchema).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      const promotion = await updateAdminSitePromotion({ id, ...changes }, ctx.user.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "promotion.updated", entityType: "promotion", entityId: id, metadata: { isActive: promotion.isActive } });
      return promotion;
    }),
    deletePromotion: marketingProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminSitePromotion(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "promotion.deleted", entityType: "promotion", entityId: input.id });
      return result;
    }),
    // Manually-entered checkout discount codes ("SALE10").
    discountCodes: marketingProcedure.query(() => getAdminDiscountCodes()),
    createDiscountCode: marketingProcedure.input(discountCodeWriteSchema).mutation(async ({ ctx, input }) => {
      if (await discountCodeExists(input.code)) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ код өмнө нь ашиглагдсан байна." });
      const code = await createAdminDiscountCode(input, ctx.user.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "discount_code.created", entityType: "discount_code", entityId: code.id, metadata: { code: code.code } });
      return code;
    }),
    updateDiscountCode: marketingProcedure.input(discountCodeUpdateSchema).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      if (changes.code && await discountCodeExists(changes.code, id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ код өмнө нь ашиглагдсан байна." });
      const code = await updateAdminDiscountCode({ id, ...changes });
      await logAdminAction({ actorUserId: ctx.user.id, action: "discount_code.updated", entityType: "discount_code", entityId: id });
      return code;
    }),
    deleteDiscountCode: marketingProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminDiscountCode(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "discount_code.deleted", entityType: "discount_code", entityId: input.id });
      return result;
    }),
    // TIER 5: bulk publish/unpublish. Only touches isPublished, so none of
    // the slug/sku/category conflict checks in validateProductWrite apply —
    // this can't collide with another product the way a full edit could.
    bulkUpdateProductPublishStatus: warehouseProcedure.input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(200),
      isPublished: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      const succeeded: number[] = [];
      const failed: { id: number; message: string }[] = [];
      for (const id of input.ids) {
        try {
          const product = await updateAdminProduct({ id, isPublished: input.isPublished });
          if (!product) throw new Error("Product not found.");
          await logAdminAction({ actorUserId: ctx.user.id, action: "product.updated", entityType: "product", entityId: product.id, metadata: { isPublished: input.isPublished, bulk: true } });
          succeeded.push(id);
        } catch (error) {
          failed.push({ id, message: error instanceof Error ? error.message : "Unable to update product." });
        }
      }
      return { succeeded, failed };
    }),
    // Admin overhaul (2026-09-08, Phase H): bulk CSV product import. Capped
    // at 500 rows/call -- CSV parsing itself happens client-side
    // (client/src/lib/csv.ts's parseCsv), this only ever receives already-
    // structured rows, never raw file bytes. dryRun:true runs the identical
    // row-processing function (importProductsCsvRows above) without the
    // final create/update DB call, so the mandatory preview step the modal
    // shows before committing can never disagree with what committing
    // actually does.
    importProductsCsv: warehouseProcedure.input(z.object({
      rows: z.array(z.record(z.string(), z.string())).min(1).max(500),
      allowUpdateExisting: z.boolean(),
      dryRun: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      const results = await importProductsCsvRows(input.rows, { allowUpdateExisting: input.allowUpdateExisting, dryRun: input.dryRun, actorUserId: ctx.user.id, actorRole: ctx.user.role });
      if (!input.dryRun) {
        await logAdminAction({ actorUserId: ctx.user.id, action: "product.csv_imported", entityType: "product", metadata: { rowCount: input.rows.length, created: results.filter(r => r.outcome === "created").length, updated: results.filter(r => r.outcome === "updated").length, skipped: results.filter(r => r.outcome === "skipped").length, errored: results.filter(r => r.outcome === "error").length } });
      }
      return { results };
    }),
    createCategory: warehouseProcedure.input(categoryWriteSchema).mutation(async ({ ctx, input }) => {
      await validateCategoryWrite(input);
      const category = await createAdminCategory(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "category.created", entityType: "category", entityId: category.id, metadata: { slug: category.slug } });
      return category;
    }),
    updateCategory: warehouseProcedure.input(categoryUpdateSchema).mutation(async ({ ctx, input }) => {
      await validateCategoryWrite(input);
      const category = await updateAdminCategory(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "category.updated", entityType: "category", entityId: category.id, metadata: { slug: category.slug } });
      return category;
    }),
    updateSiteMedia: marketingProcedure.input(z.object({
      slotKey: siteMediaSlotSchema,
      imageUrl: z.string().trim().min(1).max(1_000),
      altText: nullableText(240),
    })).mutation(async ({ ctx, input }) => {
      const media = await upsertSiteMedia({ ...input, updatedByUserId: ctx.user.id });
      await logAdminAction({ actorUserId: ctx.user.id, action: "site_media.updated", entityType: "site_media", entityId: media.id, metadata: { slotKey: input.slotKey } });
      return media;
    }),
    clearSiteMedia: marketingProcedure.input(z.object({ slotKey: siteMediaSlotSchema })).mutation(async ({ ctx, input }) => {
      await deleteSiteMedia(input.slotKey);
      await logAdminAction({ actorUserId: ctx.user.id, action: "site_media.cleared", entityType: "site_media", metadata: { slotKey: input.slotKey } });
      return { slotKey: input.slotKey };
    }),
    updateSiteText: marketingProcedure.input(z.object({
      slotKey: siteTextSlotSchema,
      textValue: z.string().trim().min(1).max(4_000),
    })).mutation(async ({ ctx, input }) => {
      const text = await upsertSiteText({ ...input, updatedByUserId: ctx.user.id });
      invalidateIndexHtmlCache();
      await logAdminAction({ actorUserId: ctx.user.id, action: "site_text.updated", entityType: "site_text", entityId: text.id, metadata: { slotKey: input.slotKey } });
      return text;
    }),
    clearSiteText: marketingProcedure.input(z.object({ slotKey: siteTextSlotSchema })).mutation(async ({ ctx, input }) => {
      await deleteSiteText(input.slotKey);
      invalidateIndexHtmlCache();
      await logAdminAction({ actorUserId: ctx.user.id, action: "site_text.cleared", entityType: "site_text", metadata: { slotKey: input.slotKey } });
      return { slotKey: input.slotKey };
    }),
    // "Controls everything" admin overhaul (2026-09-08, Phase A): same
    // marketingProcedure tier as siteText/siteMedia above -- these are
    // storefront-facing business rules (delivery fee, email wording), not a
    // financial-authorization decision like refundOrder/adjustStoreCredit.
    updateStoreSetting: marketingProcedure.input(z.object({
      settingKey: storeSettingKeySchema,
      settingValue: z.string().trim().min(1).max(2_000),
    })).mutation(async ({ ctx, input }) => {
      // A "number"-typed slot feeds straight into a price calculation
      // (checkout's delivery fee) -- a non-numeric value here wouldn't just
      // look wrong, it would silently turn every order total into NaN. Caught
      // at write time, not left for the read side to discover.
      const slot = getStoreSettingSlot(input.settingKey);
      if (slot.type === "number" && !Number.isFinite(Number(input.settingValue))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ тохиргоо зөвхөн тоо байх ёстой." });
      }
      // An email template declares which {tokens} it understands. A token
      // this slot doesn't fill would be sent to a real customer as literal
      // text, so a typo is rejected here rather than discovered in an
      // inbox. A slot with no declared tokens accepts none at all.
      const allowedTokens: readonly string[] = ("tokens" in slot ? slot.tokens : []) ?? [];
      const unknownTokens = tokensIn(input.settingValue).filter(token => !allowedTokens.includes(token));
      if (unknownTokens.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: allowedTokens.length
            ? `Танигдахгүй орлуулга: ${unknownTokens.join(", ")}. Энэ талбарт зөвхөн ${allowedTokens.join(", ")} ашиглана.`
            : `Энэ талбар орлуулга авахгүй, гэвч ${unknownTokens.join(", ")} гэж бичигдсэн байна.`,
        });
      }
      const setting = await upsertStoreSetting({ ...input, updatedByUserId: ctx.user.id });
      invalidateIndexHtmlCache();
      await logAdminAction({ actorUserId: ctx.user.id, action: "store_settings.updated", entityType: "store_settings", entityId: setting.id, metadata: { settingKey: input.settingKey } });
      return setting;
    }),
    // ---- Legal documents (2026-09-12) ---------------------------------
    // marketingProcedure, the same weight as site text/media: this is
    // published page copy. The HTML is sanitized inside upsertSiteDocument
    // (server/db.ts) on every write, exactly like posts.content, because
    // the same TinyMCE "Text" tab can paste raw markup.
    updateSiteDocument: marketingProcedure.input(z.object({
      documentKey: legalDocumentKeySchema,
      title: z.string().trim().min(2).max(200),
      lead: nullableText(2_000),
      contentHtml: z.string().trim().min(10).max(200_000),
      updatedLabel: nullableText(40),
    })).mutation(async ({ ctx, input }) => {
      const document = await upsertSiteDocument({
        documentKey: input.documentKey,
        title: input.title,
        lead: input.lead ?? null,
        contentHtml: input.contentHtml,
        updatedLabel: input.updatedLabel ?? null,
        updatedByUserId: ctx.user.id,
      });
      await logAdminAction({ actorUserId: ctx.user.id, action: "site_document.updated", entityType: "site_document", entityId: document.id, metadata: { documentKey: input.documentKey } });
      return document;
    }),
    clearSiteDocument: marketingProcedure.input(z.object({ documentKey: legalDocumentKeySchema })).mutation(async ({ ctx, input }) => {
      await deleteSiteDocument(input.documentKey);
      await logAdminAction({ actorUserId: ctx.user.id, action: "site_document.cleared", entityType: "site_document", entityId: null, metadata: { documentKey: input.documentKey } });
      return { documentKey: input.documentKey };
    }),

    // ---- Loyalty ladder (2026-09-12) ----------------------------------
    // adminProcedure, NOT marketingProcedure: unlike page copy, these
    // numbers are enforced at checkout (getApplicableLoyaltyDiscount), so
    // editing them changes what every qualifying customer is charged.
    // Same reasoning that keeps refunds and role changes admin-only.
    saveLoyaltyTier: adminProcedure.input(z.object({
      id: z.number().int().positive().optional(),
      name: z.string().trim().min(1).max(60),
      discountPercent: z.number().int().min(0).max(100),
      minSpendMnt: z.number().int().min(0).max(2_000_000_000),
      sortOrder: z.number().int().min(0).max(10_000),
    })).mutation(async ({ ctx, input }) => {
      let tier;
      try {
        tier = await upsertLoyaltyTier({ ...input, updatedByUserId: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Зэрэглэлийг хадгалж чадсангүй." });
      }
      await logAdminAction({ actorUserId: ctx.user.id, action: "loyalty_tier.saved", entityType: "loyalty_tier", entityId: tier.id, metadata: { name: tier.name, discountPercent: tier.discountPercent, minSpendMnt: tier.minSpendMnt } });
      return tier;
    }),
    deleteLoyaltyTier: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        await deleteLoyaltyTier(input.id);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Зэрэглэлийг устгаж чадсангүй." });
      }
      await logAdminAction({ actorUserId: ctx.user.id, action: "loyalty_tier.deleted", entityType: "loyalty_tier", entityId: input.id, metadata: {} });
      return { id: input.id };
    }),

    clearStoreSetting: marketingProcedure.input(z.object({ settingKey: storeSettingKeySchema })).mutation(async ({ ctx, input }) => {
      await deleteStoreSetting(input.settingKey);
      invalidateIndexHtmlCache();
      await logAdminAction({ actorUserId: ctx.user.id, action: "store_settings.cleared", entityType: "store_settings", metadata: { settingKey: input.settingKey } });
      return { settingKey: input.settingKey };
    }),
    uploadProductImage: warehouseProcedure
      .input(z.object({
        fileName: z.string().trim().min(1).max(120),
        contentType: z.enum(imageContentTypes),
        dataBase64: z.string().min(16).max(14_000_000),
      }))
      .mutation(async ({ input, ctx }) => {
        const rawBase64 = input.dataBase64.includes(",") ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1) : input.dataBase64;
        const buffer = Buffer.from(rawBase64, "base64");
        if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Product images must be between 1 byte and 8 MB." });
        }
        assertImageSignature(buffer, input.contentType);

        // Frontend performance audit (2026-09-02): always stored as WebP
        // now, with a 600px grid derivative alongside it -- see
        // shared/image-variants.ts for why the .webp extension is what
        // signals "a derivative exists" to components that render srcset.
        const safeStem = input.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "product";
        const variants = await processUploadedImageVariantsOrThrow(buffer, IMAGE_MAX_DIMENSION.product);
        const stored = await storagePutImageVariants(`catalog/products/${ctx.user.id}/${safeStem}.webp`, variants);
        return { url: stored.url, key: stored.key };
      }),
    uploadSiteMediaImage: marketingProcedure
      .input(z.object({
        fileName: z.string().trim().min(1).max(120),
        contentType: z.enum(imageContentTypes),
        dataBase64: z.string().min(16).max(14_000_000),
      }))
      .mutation(async ({ input, ctx }) => {
        const rawBase64 = input.dataBase64.includes(",") ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1) : input.dataBase64;
        const buffer = Buffer.from(rawBase64, "base64");
        if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Content images must be between 1 byte and 8 MB." });
        }
        assertImageSignature(buffer, input.contentType);
        const safeStem = input.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "site-media";
        const variants = await processUploadedImageVariantsOrThrow(buffer, IMAGE_MAX_DIMENSION.siteMedia);
        const stored = await storagePutImageVariants(`site-media/${ctx.user.id}/${safeStem}-${Date.now()}.webp`, variants);
        return { url: stored.url, key: stored.key };
      }),
    // Journal post cover images (posts.coverImageUrl) -- same generic
    // "give me bytes, get back an R2 URL" shape as uploadProductImage/
    // uploadSiteMediaImage above, just its own storage path. Reuses
    // IMAGE_MAX_DIMENSION.siteMedia (same "full-width banner" scale a
    // journal cover reads at) rather than adding a new dimension constant.
    uploadPostCoverImage: staffProcedure
      .input(z.object({
        fileName: z.string().trim().min(1).max(120),
        contentType: z.enum(imageContentTypes),
        dataBase64: z.string().min(16).max(14_000_000),
      }))
      .mutation(async ({ input, ctx }) => {
        const rawBase64 = input.dataBase64.includes(",") ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1) : input.dataBase64;
        const buffer = Buffer.from(rawBase64, "base64");
        if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cover images must be between 1 byte and 8 MB." });
        }
        assertImageSignature(buffer, input.contentType);
        const safeStem = input.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "post";
        const variants = await processUploadedImageVariantsOrThrow(buffer, IMAGE_MAX_DIMENSION.siteMedia);
        const stored = await storagePutImageVariants(`posts/${ctx.user.id}/${safeStem}-${Date.now()}.webp`, variants);
        return { url: stored.url, key: stored.key };
      }),
    // 2026-09-07: backs the new Media Library modal (MediaLibraryModal.tsx)
    // -- the first real, browsable/searchable media library in this codebase
    // (every prior upload mutation above fills exactly one URL slot and
    // forgets the upload ever happened). Same base64->sharp->R2 pipeline as
    // uploadPostCoverImage, but additionally records a media_library row so
    // it can be found again later, from either the cover-image picker or an
    // in-content "Add Media" insert.
    uploadMedia: staffProcedure
      .input(z.object({
        fileName: z.string().trim().min(1).max(120),
        contentType: z.enum(imageContentTypes),
        dataBase64: z.string().min(16).max(14_000_000),
      }))
      .mutation(async ({ input, ctx }) => {
        const rawBase64 = input.dataBase64.includes(",") ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1) : input.dataBase64;
        const buffer = Buffer.from(rawBase64, "base64");
        if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Media files must be between 1 byte and 8 MB." });
        }
        assertImageSignature(buffer, input.contentType);
        const safeStem = input.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "media";
        const variants = await processUploadedImageVariantsOrThrow(buffer, IMAGE_MAX_DIMENSION.siteMedia);
        const stored = await storagePutImageVariants(`media/${ctx.user.id}/${safeStem}-${Date.now()}.webp`, variants);
        const item = await insertMediaLibraryItem({ key: stored.key, url: stored.url, fileName: input.fileName, contentType: "image/webp", sizeBytes: variants.full.length, uploadedByUserId: ctx.user.id });
        await logAdminAction({ actorUserId: ctx.user.id, action: "media.uploaded", entityType: "media", entityId: item.id, metadata: { fileName: input.fileName } });
        return item;
      }),
  }),
});

export type AppRouter = typeof appRouter;
