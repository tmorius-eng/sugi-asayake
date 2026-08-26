import { COOKIE_NAME, GUEST_CART_COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { getGuestCartCookieOptions, getSessionCookieOptions } from "./_core/cookies";
import { notifyOwner, sendAccountEmail } from "./_core/notification";
import { systemRouter } from "./_core/systemRouter";
import { signSessionToken, type TrpcContext } from "./_core/context";
import { hashPassword, verifyPassword } from "./_core/password";
import {
  acceptStaffInvitation,
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
  createAdminProduct,
  createAdminDiscountCode,
  createAdminRoutine,
  createAdminSitePromotion,
  createEmailVerificationCode,
  createOrderFromActiveCart,
  createPasswordResetCode,
  createProductReview,
  getActiveCartForOwner,
  getApplicableLoyaltyDiscount,
  getApplicableRoutineDiscount,
  getUserLoyaltyStatus,
  createQPayPaymentAttempt,
  createStaffInvitation,
  createUserAddress,
  createUserWithPassword,
  dbPing,
  deleteAdminDiscountCode,
  deleteAdminReview,
  deleteAdminRoutine,
  deleteAdminSitePromotion,
  deleteUserAccount,
  deleteUserAddress,
  discountCodeExists,
  deleteAdminPost,
  deleteAdminProduct,
  getActiveSitePromotion,
  getAdminAuditLogs,
  getAdminDiscountCodes,
  getAdminIntegrations,
  getAdminSitePromotions,
  getAdminCategories,
  getAdminDashboardSummary,
  getAdminOrders,
  getAdminPosts,
  getAdminProducts,
  getAdminReviews,
  getAdminRoutineDetail,
  getAdminRoutines,
  getAdminStaffInvitations,
  getAdminUserDetail,
  getAdminUsers,
  getCategoryWriteConflicts,
  getLatestQPayPaymentAttemptForOrder,
  getLoginHistory,
  getOrderForUser,
  getOrdersForUser,
  getProductBySlug,
  getProductReviews,
  getProductStockQuantity,
  getProductWriteConflicts,
  getBestsellingProducts,
  getPublishedCatalog,
  searchPublishedCatalog,
  getPublishedRoutineBySlug,
  getRecommendedProducts,
  getPublishedPosts,
  getPublishedPostBySlug,
  getReviewEligibility,
  getRoutineForProduct,
  getSiteMedia,
  getStaffInvitationByTokenHash,
  getUserByEmail,
  getUserById,
  getWishlistForUser,
  getWishlistWatchersForProduct,
  logAdminAction,
  mergeGuestCartIntoUserCart,
  postSlugExists,
  recordLoginAttempt,
  removeWishlistItem,
  resetPasswordWithCode,
  revokeStaffInvitation,
  deleteSiteMedia,
  getUserAddresses,
  routineSlugExists,
  validateDiscountCode,
  setReviewApproval,
  setRoutineSteps,
  suspendUser,
  touchUserLastSignedIn,
  unsuspendUser,
  upsertSiteMedia,
  updateAdminCategory,
  updateAdminOrder,
  updateAdminPost,
  updateAdminProduct,
  updateAdminDiscountCode,
  updateAdminRoutine,
  updateAdminSitePromotion,
  updateAdminUserRole,
  updateAdminIntegration,
  updateUserLoyaltyAdjustment,
  updateCartItemQuantity,
  updateNotificationPreferences,
  updatePendingRegistration,
  updateUserAddress,
  updateUserAvatar,
  updateUserPreferences,
  updateUserProfile,
  verifyEmailWithCode,
} from "./db";
import { adminProcedure, moderateRateLimitedProcedure, protectedProcedure, publicProcedure, router, staffProcedure, strictRateLimitedProcedure, strictRateLimitedProtectedProcedure } from "./_core/trpc";
import { storagePing, storagePut } from "./storage";
import { IMAGE_MAX_DIMENSION, processUploadedImage } from "./_core/imageProcessing";
import { createQPayInvoice, getQPayAvailability } from "./qpay";
import { getCategoryWriteViolation, getProductWriteViolation } from "./catalog-validation";
import { siteMediaSlotKeys } from "../shared/site-media";

const slugSchema = z.string().trim().min(2).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.");
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
// Shared between profile.updatePreferences (what a shopper says about
// themselves) and the admin product form (what a product is tagged with) —
// see PREMIUM-FEATURES.md TIER 1. Same vocabulary on both sides is what
// makes "recommended for you" a plain intersection, not a lookup table.
const skinTypeSchema = z.enum(["dry", "oily", "combination", "sensitive", "normal"]).nullable().optional();
const skinConcernsSchema = z.string().trim().max(300).nullable().optional();
const interiorStyleSchema = z.string().trim().max(60).nullable().optional();
// Same shape checkout.createOrder already validates customerPhone with —
// reused here so profile.update and the address book accept exactly the
// same phone formats a delivery actually needs.
const phoneSchema = z.string().trim().min(6).max(40).regex(/^[0-9+()\-\s]{6,40}$/, "Утасны дугаараа зөв оруулна уу.").refine(value => value.replace(/\D/g, "").length >= 8, "Утасны дугаараа зөв оруулна уу.");
const addressWriteSchema = z.object({
  label: z.string().trim().min(1).max(60),
  recipientName: z.string().trim().min(2).max(160),
  phone: phoneSchema,
  addressLine: z.string().trim().min(8).max(2_000),
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
  sku: z.string().trim().min(2).max(80),
  imageUrl: nullableText(1_000),
  galleryJson: nullableText(20_000),
  stockQuantity: z.number().int().min(0).max(1_000_000),
  isPublished: z.boolean(),
  skinType: skinTypeSchema,
  skinConcerns: skinConcernsSchema,
  interiorStyle: interiorStyleSchema,
});

const categoryWriteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only."),
  description: nullableText(2_000),
  imageUrl: nullableText(1_000),
  sortOrder: z.number().int().min(0).max(10_000),
  isActive: z.boolean(),
});

const productUpdateSchema = productWriteSchema.partial().extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one product field to update." },
);

const categoryUpdateSchema = categoryWriteSchema.partial().extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one category field to update." },
);

const postWriteSchema = z.object({
  title: z.string().trim().min(3).max(220),
  slug: slugSchema,
  excerpt: nullableText(1_000),
  content: z.string().trim().min(10).max(30_000),
  coverImageUrl: nullableText(1_000),
  isPublished: z.boolean(),
});
const postUpdateSchema = postWriteSchema.partial().extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one post field to update." },
);
// PREMIUM-FEATURES.md TIER 4.
const routineWriteSchema = z.object({
  name: z.string().trim().min(2).max(180),
  slug: slugSchema,
  description: nullableText(2_000),
  discountPercent: z.number().int().min(0).max(100),
  isPublished: z.boolean(),
});
const routineUpdateSchema = routineWriteSchema.partial().extend({ id: z.number().int().positive() }).refine(
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
const promotionUpdateSchema = promotionWriteSchema.partial().extend({ id: z.number().int().positive() }).refine(
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
  isActive: z.boolean(),
  expiresAt: z.coerce.date().nullable().optional(),
});
const discountCodeWriteSchema = discountCodeBaseSchema.refine(
  value => (value.type === "percent" ? Boolean(value.percentValue) : Boolean(value.fixedAmountMnt)),
  { message: "percent төрөлд хувь, fixed төрөлд дүн заавал шаардлагатай.", path: ["percentValue"] },
);
const discountCodeUpdateSchema = discountCodeBaseSchema.partial().extend({ id: z.number().int().positive() }).refine(
  value => Object.keys(value).some(key => key !== "id"),
  { message: "Provide at least one discount code field to update." },
);
const orderStatusSchema = z.enum(["pending", "confirmed", "packed", "out_for_delivery", "completed", "cancelled"]);
const orderUpdateSchema = z.object({
  id: z.number().int().positive(),
  status: orderStatusSchema.optional(),
  deliveryTrackingRef: nullableText(180),
  adminNote: nullableText(5_000),
}).refine(
  value => value.status !== undefined || value.deliveryTrackingRef !== undefined || value.adminNote !== undefined,
  { message: "Provide an order update." },
);

const imageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const staffRoleSchema = z.enum(["user", "staff", "admin"]);
const siteMediaSlotSchema = z.enum(siteMediaSlotKeys);
const invitationTokenSchema = z.string().trim().min(32).max(256);
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
// 6-digit OTP codes (email verification + password reset) — validity window
// and the input shape the client submits them in.
const OTP_TTL_MS = 15 * 60 * 1000;
const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, "6 оронтой кодоо оруулна уу.");

// A syntactically valid but unusable scrypt hash (correct salt/hash lengths,
// see server/_core/password.ts), used to run `verifyPassword` through its
// full computation even when no account matches the submitted email. Without
// this, a login attempt for a real account pays for a scrypt derivation
// while one for a nonexistent email returns almost instantly — an attacker
// can use that timing gap alone to enumerate registered emails without ever
// guessing a password.
const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

function parseAppOrigin(originInput: string): URL {
  const origin = new URL(originInput);
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A secure application origin is required for this link." });
  }
  return origin;
}

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

// Generates a 6-digit OTP, stores its hash, and emails it. Shared by
// register (new account), resendRegistrationCode (pending account, not
// logged in yet) and resendVerificationEmail (already logged in, legacy
// unverified account). Returns whether the email was actually dispatched via
// Brevo (false = only logged to the server console — see notification.ts).
async function sendVerificationCode(userId: number, email: string): Promise<boolean> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await createEmailVerificationCode({ userId, codeHash: tokenHash(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  return sendAccountEmail({
    to: email,
    subject: "SUGI ASAYAKE — Баталгаажуулах код",
    content: `Таны баталгаажуулах код: ${code}\n\nЭнэ код 15 минутын дотор хүчинтэй. Хэрэв та энэ хүсэлтийг илгээгээгүй бол энэ имэйлийг үл тоомсорлож болно.`,
  });
}

// ROADMAP.md TIER 2: order confirmation + status-change notifications.
// Both are best-effort (see the try/catch at each call site) — a Brevo
// hiccup should never fail or roll back a real order.
const formatMnt = (amountMnt: number) => `${new Intl.NumberFormat("mn-MN").format(amountMnt)}₮`;
const orderStatusMessages: Record<string, string> = {
  confirmed: "Таны захиалгыг баталгаажууллаа.",
  packed: "Таны захиалгыг бэлтгэж дууслаа.",
  out_for_delivery: "Таны захиалга хүргэлтэд гарлаа.",
  completed: "Таны захиалга амжилттай хүргэгдлээ. Худалдан авалт хийсэнд баярлалаа!",
  cancelled: "Таны захиалгыг цуцаллаа. Асуух зүйл байвал бидэнтэй холбогдоно уу.",
};

async function sendOrderConfirmationEmail(order: { orderNumber: string; customerEmail: string | null; customerName: string; totalMnt: number; deliveryMethod: string; deliveryAddress: string | null; pickupBranch: string | null; items: { name: string; quantity: number; priceMnt: number }[]; discountMnt?: number; routineName?: string | null; couponCode?: string | null; couponDiscountMnt?: number; loyaltyDiscountMnt?: number; appliedLoyaltyTierName?: string | null }) {
  if (!order.customerEmail) return;
  const itemLines = order.items.map(item => `- ${item.name} × ${item.quantity} (${formatMnt(item.priceMnt * item.quantity)})`).join("\n");
  const deliveryLine = order.deliveryMethod === "store_pickup" ? `Хүргэлт: ${order.pickupBranch} салбараас өөрөө авах` : `Хүргэлт: ${order.deliveryAddress ?? "Улаанбаатар хот дотор"}`;
  // PREMIUM-FEATURES.md TIER 4/5 + coupon codes: only mentioned when actually applied.
  const routineDiscountLine = order.discountMnt && order.discountMnt > 0 ? `\n"${order.routineName}" routine хямдрал: -${formatMnt(order.discountMnt)}` : "";
  const couponDiscountLine = order.couponDiscountMnt && order.couponDiscountMnt > 0 ? `\n"${order.couponCode}" хямдралын код: -${formatMnt(order.couponDiscountMnt)}` : "";
  const loyaltyDiscountLine = order.loyaltyDiscountMnt && order.loyaltyDiscountMnt > 0 ? `\n"${order.appliedLoyaltyTierName}" гишүүнчлэлийн хямдрал: -${formatMnt(order.loyaltyDiscountMnt)}` : "";
  await sendAccountEmail({
    to: order.customerEmail,
    subject: `SUGI ASAYAKE — Захиалга баталгаажлаа (${order.orderNumber})`,
    content: `Сайн байна уу, ${order.customerName}!\n\nТаны ${order.orderNumber} дугаартай захиалгыг хүлээн авлаа:\n\n${itemLines}${routineDiscountLine}${couponDiscountLine}${loyaltyDiscountLine}\n\nНийт дүн: ${formatMnt(order.totalMnt)}\n${deliveryLine}\n\nЗахиалгынхаа явцыг веб сайтаас харах боломжтой. Худалдан авалт хийсэнд баярлалаа!`,
  });
}

async function sendOrderStatusUpdateEmail(order: { orderNumber: string; customerEmail: string | null; customerName: string; status: string; deliveryTrackingRef: string | null }) {
  if (!order.customerEmail) return;
  const message = orderStatusMessages[order.status];
  if (!message) return; // "pending" (initial state) has no transition to announce.
  const trackingLine = order.deliveryTrackingRef ? `\nХүргэлтийн дугаар: ${order.deliveryTrackingRef}` : "";
  await sendAccountEmail({
    to: order.customerEmail,
    subject: `SUGI ASAYAKE — Захиалга ${order.orderNumber}: шинэчлэлт`,
    content: `Сайн байна уу, ${order.customerName}!\n\n${message}${trackingLine}\n\nЗахиалгын дугаар: ${order.orderNumber}`,
  });
}

function assertImageSignature(buffer: Buffer, contentType: (typeof imageContentTypes)[number]) {
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const matches = (contentType === "image/jpeg" && isJpeg) || (contentType === "image/png" && isPng) || (contentType === "image/webp" && isWebp);

  if (!matches) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The file content does not match the selected image type." });
  }
}

// assertImageSignature above only checks the first few magic bytes, which a
// truncated/otherwise-corrupt upload can still satisfy; sharp's actual
// decode (inside processUploadedImage) is the real validity check. Wrapping
// it here turns a raw decoder exception into a clean, translated
// BAD_REQUEST instead of leaking an internal stack trace to the client.
async function processUploadedImageOrThrow(buffer: Buffer, contentType: (typeof imageContentTypes)[number], maxDimension: number): Promise<Buffer> {
  try {
    return await processUploadedImage(buffer, contentType, maxDimension);
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

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // Creates the account but does NOT log the caller in — that only
    // happens once auth.confirmRegistration checks out the emailed code, so
    // an account with an unconfirmed email address can never shop or log in
    // (see the emailVerifiedAt gate on auth.login below).
    register: strictRateLimitedProcedure
      .input(z.object({
        email: z.string().trim().email().max(320),
        password: z.string().min(8).max(200),
        name: z.string().trim().min(1).max(160).optional(),
      }))
      .mutation(async ({ input }) => {
        const passwordHash = await hashPassword(input.password);
        const existing = await getUserByEmail(input.email);
        let userId: number;
        let email: string;
        if (existing) {
          if (existing.emailVerifiedAt) {
            throw new TRPCError({ code: "CONFLICT", message: "Энэ имэйлээр бүртгэл үүссэн байна. Нэвтэрнэ үү." });
          }
          // A previous registration with this email was never confirmed —
          // treat this submission as a retry rather than hard-failing on the
          // email uniqueness constraint: refresh the credentials and send a
          // fresh code.
          await updatePendingRegistration({ userId: existing.id, passwordHash, name: input.name ?? null });
          userId = existing.id;
          email = existing.email;
        } else {
          let user;
          try {
            user = await createUserWithPassword({ email: input.email, passwordHash, name: input.name ?? null });
          } catch (error) {
            throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Энэ имэйлээр бүртгэл үүссэн байна." });
          }
          userId = user.id;
          email = user.email;
        }
        const codeSent = await sendVerificationCode(userId, email);
        return { pendingVerification: true, email, codeSent } as const;
      }),
    // Second step of registration: exchanges the emailed 6-digit code for
    // the account's first session.
    confirmRegistration: strictRateLimitedProcedure
      .input(z.object({ email: z.string().trim().email().max(320), code: otpCodeSchema }))
      .mutation(async ({ ctx, input }) => {
        const pending = await getUserByEmail(input.email);
        if (!pending) throw new TRPCError({ code: "BAD_REQUEST", message: "Код буруу эсвэл хугацаа дууссан байна." });
        try {
          await verifyEmailWithCode({ userId: pending.id, codeHash: tokenHash(input.code) });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Код баталгаажуулж чадсангүй." });
        }
        const user = await getUserByEmail(input.email); // refetch: emailVerifiedAt just changed
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Бүртгэл олдсонгүй." });
        await touchUserLastSignedIn(user.id);
        const token = await signSessionToken(user.id, user.sessionVersion);
        ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));
        await mergeGuestCartAndClearCookie(ctx, user.id);
        const { passwordHash: _omit, ...safeUser } = user;
        return safeUser;
      }),
    // Public (not logged in yet) resend, for the pending-registration step.
    resendRegistrationCode: strictRateLimitedProcedure
      .input(z.object({ email: z.string().trim().email().max(320) }))
      .mutation(async ({ input }) => {
        const pending = await getUserByEmail(input.email);
        // Same generic-response shape as requestPasswordReset: don't reveal
        // whether the address has a pending registration.
        if (pending && !pending.emailVerifiedAt) {
          await sendVerificationCode(pending.id, pending.email);
        }
        return { success: true } as const;
      }),
    login: strictRateLimitedProcedure
      .input(z.object({
        email: z.string().trim().email().max(320),
        password: z.string().min(1).max(200),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await getUserByEmail(input.email);
        // Always run the full password check, even for a nonexistent user
        // (against a dummy hash) — see DUMMY_PASSWORD_HASH above.
        const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
        const ipAddress = ctx.req.ip || ctx.req.socket.remoteAddress || null;
        const logAttempt = (success: boolean, reason?: string) => recordLoginAttempt({ email: input.email, userId: user?.id ?? null, success, reason, ipAddress });

        if (!user || !valid) {
          await logAttempt(false, "invalid_credentials");
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Имэйл эсвэл нууц үг буруу байна." });
        }
        if (user.suspendedAt) {
          await logAttempt(false, "suspended");
          throw new TRPCError({ code: "FORBIDDEN", message: "Таны эрх түр хаагдсан байна. Дэлгүүрийн админтай холбогдоно уу." });
        }
        // Accounts created after the OTP-code registration flow shipped
        // never get a session until confirmRegistration succeeds; this
        // closes the loophole of registering, ignoring the code, and just
        // logging in directly. Accounts that existed before this flow
        // shipped were backfilled to verified (drizzle/0016) so this never
        // locks out a pre-existing user.
        if (!user.emailVerifiedAt) {
          await logAttempt(false, "unverified");
          throw new TRPCError({ code: "FORBIDDEN", message: "Имэйл хаягаа баталгаажуулаагүй байна. Бүртгүүлэх хуудас руу ижил имэйлээрээ дахин орж, код дахин авна уу." });
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
    requestPasswordReset: strictRateLimitedProcedure
      .input(z.object({ email: z.string().trim().email().max(320) }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email);
        // Always generate a code, whether or not the email is registered:
        // both branches should pay the same CPU cost, so this endpoint can't
        // be used to enumerate accounts via a response-time side channel (the
        // 8-request/15min cap on this procedure also makes that attack hard
        // to mount in practice, but there's no reason to leave the gap open).
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        if (user) {
          await createPasswordResetCode({ userId: user.id, codeHash: tokenHash(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
          await sendAccountEmail({
            to: user.email,
            subject: "SUGI ASAYAKE — Нууц үг сэргээх код",
            content: `Таны нууц үг сэргээх код: ${code}\n\nЭнэ код 15 минутын дотор хүчинтэй. Хэрэв та энэ хүсэлтийг илгээгээгүй бол энэ имэйлийг үл тоомсорлож болно.`,
          });
        }
        // Always return the same generic response either way.
        return { success: true } as const;
      }),
    resetPassword: strictRateLimitedProcedure
      .input(z.object({ email: z.string().trim().email().max(320), code: otpCodeSchema, password: z.string().min(8).max(200) }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email);
        if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "Код буруу эсвэл хугацаа дууссан байна." });
        const passwordHash = await hashPassword(input.password);
        try {
          await resetPasswordWithCode({ userId: user.id, codeHash: tokenHash(input.code), passwordHash });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Нууц үг сэргээж чадсангүй." });
        }
        return { success: true } as const;
      }),
    // For an already-logged-in user with an unverified email (legacy
    // accounts only — every account created after this flow shipped is
    // already verified by the time it has a session, see auth.login above).
    verifyEmailCode: strictRateLimitedProtectedProcedure
      .input(z.object({ code: otpCodeSchema }))
      .mutation(async ({ ctx, input }) => {
        try {
          await verifyEmailWithCode({ userId: ctx.user.id, codeHash: tokenHash(input.code) });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Имэйл хаягийг баталгаажуулж чадсангүй." });
        }
        return { success: true } as const;
      }),
    resendVerificationEmail: strictRateLimitedProtectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Таны бүртгэлд имэйл хаяг байхгүй байна." });
        if (ctx.user.emailVerifiedAt) return { success: true, alreadyVerified: true } as const;
        await sendVerificationCode(ctx.user.id, ctx.user.email);
        return { success: true, alreadyVerified: false } as const;
      }),
  }),
  catalog: router({
    list: publicProcedure.query(() => getPublishedCatalog()),
    // Server-side search (ROADMAP.md TIER 2) — a 2+ character query returns
    // matches from the FULLTEXT index instead of the client filtering the
    // full catalog.list payload. See searchPublishedCatalog for the exact
    // matching behavior.
    search: publicProcedure.input(z.object({ query: z.string().trim().min(2).max(120) })).query(({ input }) => searchPublishedCatalog(input.query)),
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(200) })).query(({ input }) => getProductBySlug(input.slug)),
    // PREMIUM-FEATURES.md TIER 1: "recommended for you" — protected, not
    // public, since it's meaningless without a saved preference profile to
    // match against (a guest has none).
    recommended: protectedProcedure.query(({ ctx }) => getRecommendedProducts(ctx.user.id)),
    // Homepage "Их зарагддаг бараа" rail — real paid-order history, not a
    // manually curated list. See getBestsellingProducts.
    bestsellers: publicProcedure.query(() => getBestsellingProducts(8)),
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
    list: publicProcedure.input(z.object({ productId: z.number().int().positive() })).query(({ input }) => getProductReviews(input.productId)),
    // protectedProcedure: a guest has no order history to verify against, so
    // there's nothing meaningful to check — the ProductDetail page only asks
    // this for a logged-in shopper.
    eligibility: protectedProcedure.input(z.object({ productId: z.number().int().positive() })).query(({ ctx, input }) => getReviewEligibility(ctx.user.id, input.productId)),
    create: protectedProcedure
      .input(z.object({ productId: z.number().int().positive(), rating: z.number().int().min(1).max(5), comment: nullableText(2_000) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await createProductReview({ userId: ctx.user.id, productId: input.productId, rating: input.rating, comment: input.comment ?? null });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Сэтгэгдэл бичиж чадсангүй." });
        }
      }),
  }),
  content: router({
    latestPosts: publicProcedure.query(() => getPublishedPosts()),
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(240) })).query(({ input }) => getPublishedPostBySlug(input.slug)),
    siteMedia: publicProcedure.query(() => getSiteMedia()),
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
        return await validateDiscountCode(input.code, subtotalMnt - (routineDiscount?.discountMnt ?? 0));
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
          const coupon = await validateDiscountCode(input.couponCode, afterRoutineMnt);
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
    addItem: moderateRateLimitedProcedure.input(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(100) })).mutation(async ({ ctx, input }) => {
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
      customerName: z.string().trim().min(2).max(160),
      customerPhone: z.string().trim().min(6).max(40).regex(/^[0-9+()\-\s]{6,40}$/, "Утасны дугаараа зөв оруулна уу.").refine(value => value.replace(/\D/g, "").length >= 8, "Утасны дугаараа зөв оруулна уу."),
      customerEmail: z.string().trim().email().max(320).nullable().optional(),
      deliveryMethod: z.enum(["ub_delivery", "store_pickup"]),
      deliveryAddress: z.string().trim().min(8).max(2_000).nullable().optional(),
      pickupBranch: z.enum(["Орос элчингийн салбар", "Их наяд плаза салбар", "Яармаг FOOD CITY салбар"]).or(z.literal("")).nullable().optional(),
      paymentMethod: z.enum(["qpay", "bank_transfer", "card", "cash_on_delivery"]),
      couponCode: z.string().trim().min(1).max(40).nullable().optional(),
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
        order = await createOrderFromActiveCart({ owner: resolveCartOwnerForWrite(ctx), ...input });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to place this order." });
      }
      // Best-effort: a failed confirmation email should never undo an
      // already-placed (and stock-decremented) order.
      try {
        await sendOrderConfirmationEmail(order);
      } catch (error) {
        console.error("[checkout.createOrder] Failed to send order confirmation email", error);
      }
      return order;
    }),
  }),
  orders: router({
    mine: protectedProcedure.query(({ ctx }) => getOrdersForUser(ctx.user.id)),
  }),
  // Customer account page: editable name/phone, an avatar photo, and a
  // saved-address book (checkout can prefill from the default address so
  // returning shoppers don't retype it every order).
  profile: router({
    update: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(160).nullable().optional(), phone: phoneSchema.nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        const updated = await updateUserProfile(ctx.user.id, input);
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
      const invoice = await createQPayInvoice({
        senderInvoiceNo: order.orderNumber,
        amountMnt: order.totalMnt,
        description: `SUGI ASAYAKE order ${order.orderNumber}`,
        callbackUrl: `${ctx.req.protocol}://${ctx.req.get("host")}/api/payments/qpay/callback`,
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
  }),
  invites: router({
    details: publicProcedure.input(z.object({ token: invitationTokenSchema })).query(async ({ input }) => {
      const invitation = await getStaffInvitationByTokenHash(tokenHash(input.token));
      if (!invitation) return { valid: false, message: "Урилга олдсонгүй." };
      if (invitation.status !== "pending") return { valid: false, message: "Энэ урилга идэвхгүй болсон байна." };
      if (invitation.expiresAt.getTime() <= Date.now()) return { valid: false, message: "Энэ урилгын хугацаа дууссан байна." };
      return { valid: true, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt };
    }),
    accept: protectedProcedure.input(z.object({ token: invitationTokenSchema })).mutation(async ({ ctx, input }) => {
      if (!ctx.user.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Your authenticated account does not provide an email address required to accept a staff invitation." });
      try {
        return await acceptStaffInvitation({ tokenHash: tokenHash(input.token), userId: ctx.user.id, userEmail: ctx.user.email });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to accept this staff invitation." });
      }
    }),
  }),
  admin: router({
    // staffProcedure, not adminProcedure: staff should still see what's
    // going on operationally (orders, low stock), just not the money —
    // revenue and the active-user count are redacted below the plain-admin
    // tier.
    dashboardSummary: staffProcedure.query(async ({ ctx }) => {
      const summary = await getAdminDashboardSummary();
      if (ctx.user.role === "admin") return summary;
      return { ...summary, totalRevenueMnt: null, activeUsers: null };
    }),
    // TIER 6: basic DB/storage reachability — not Sentry, just two pings for
    // a small dashboard widget. Non-sensitive (no data, just up/down + a
    // terse error string), so staff can see it too — the same audience as
    // the rest of the dashboard.
    systemHealth: staffProcedure.query(async () => {
      const [db, storage] = await Promise.all([dbPing(), storagePing()]);
      return { db, storage };
    }),
    // Same idea for search: staff can look up products/orders, but user
    // records (and thus any way to reach user management from a search hit)
    // are admin-only.
    search: staffProcedure.input(z.object({ query: z.string().trim().min(1).max(120) })).query(async ({ ctx, input }) => {
      const result = await adminGlobalSearch(input.query);
      if (ctx.user.role === "admin") return result;
      return { ...result, users: [] };
    }),
    products: staffProcedure.query(() => getAdminProducts()),
    categories: staffProcedure.query(() => getAdminCategories()),
    orders: staffProcedure.query(() => getAdminOrders()),
    posts: staffProcedure.query(() => getAdminPosts()),
    siteMedia: staffProcedure.query(() => getSiteMedia()),
    users: adminProcedure.query(() => getAdminUsers()),
    staffInvitations: adminProcedure.query(() => getAdminStaffInvitations()),
    inviteStaff: adminProcedure.input(z.object({ email: z.string().trim().email().max(320), role: staffRoleSchema.default("user"), origin: z.string().url().max(500) })).mutation(async ({ ctx, input }) => {
      const origin = parseAppOrigin(input.origin);
      const token = randomBytes(32).toString("base64url");
      const invitation = await createStaffInvitation({ email: input.email, role: input.role, tokenHash: tokenHash(token), invitedByUserId: ctx.user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      const inviteUrl = `${origin.origin}/invite/${token}`;
      const ownerAlertSent = await notifyOwner({ title: "SUGI ASAYAKE staff invitation", content: `Invitation created for ${invitation.email} with ${invitation.role} access. Share this link securely before ${invitation.expiresAt.toISOString()}: ${inviteUrl}` });
      await logAdminAction({ actorUserId: ctx.user.id, action: "staff_invitation.created", entityType: "staff_invitation", entityId: invitation.id, metadata: { email: invitation.email, role: invitation.role } });
      return { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, inviteUrl, ownerAlertSent };
    }),
    revokeStaffInvitation: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await revokeStaffInvitation(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "staff_invitation.revoked", entityType: "staff_invitation", entityId: input.id });
      return result;
    }),
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
    userDetail: adminProcedure.input(z.object({ userId: z.number().int().positive() })).query(async ({ input }) => {
      const detail = await getAdminUserDetail(input.userId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      return detail;
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
    // Admin-manageable third-party provider config (eBarimt/StorePay/Golomt
    // card/eBuuhia courier) -- adminProcedure, not staffProcedure, since
    // these are financial/security-sensitive credentials. QPay isn't part
    // of this (still env-based, see server/qpay.ts).
    integrations: adminProcedure.query(() => getAdminIntegrations()),
    updateIntegration: adminProcedure.input(z.object({
      provider: z.enum(["ebarimt", "storepay", "card_golomt", "courier_ebuuhia"]),
      isActive: z.boolean().optional(),
      config: z.record(z.string().max(80), z.string().max(2_000)).optional(),
    })).mutation(async ({ ctx, input }) => {
      const result = await updateAdminIntegration(input, ctx.user.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "integration.updated", entityType: "integration", metadata: { provider: input.provider, isActive: input.isActive, credentialsChanged: Boolean(input.config && Object.keys(input.config).length > 0) } });
      return result;
    }),
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
    auditLogs: adminProcedure.input(z.object({
      action: z.string().trim().max(100).optional(),
      actorEmail: z.string().trim().max(320).optional(),
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
      limit: z.number().int().positive().max(200).optional(),
    })).query(({ input }) => getAdminAuditLogs({
      action: input.action || undefined,
      actorEmail: input.actorEmail || undefined,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      limit: input.limit,
    })),
    loginHistory: adminProcedure.input(z.object({
      email: z.string().trim().max(320).optional(),
      outcome: z.enum(["all", "success", "failed"]).default("all"),
      limit: z.number().int().positive().max(200).optional(),
    })).query(({ input }) => getLoginHistory({
      email: input.email || undefined,
      success: input.outcome === "success" ? true : input.outcome === "failed" ? false : undefined,
      limit: input.limit,
    })),
    updateOrder: staffProcedure.input(orderUpdateSchema).mutation(async ({ ctx, input }) => {
      let order;
      try {
        order = await updateAdminOrder(input);
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
    bulkUpdateOrderStatus: staffProcedure.input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(200),
      status: orderStatusSchema,
    })).mutation(async ({ ctx, input }) => {
      const succeeded: number[] = [];
      const failed: { id: number; message: string }[] = [];
      for (const id of input.ids) {
        try {
          const order = await updateAdminOrder({ id, status: input.status });
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
    deletePost: staffProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminPost(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "post.deleted", entityType: "post", entityId: input.id });
      return result;
    }),
    createProduct: staffProcedure.input(productWriteSchema).mutation(async ({ ctx, input }) => {
      await validateProductWrite(input);
      const product = await createAdminProduct(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "product.created", entityType: "product", entityId: product.id, metadata: { slug: product.slug, published: product.isPublished } });
      return product;
    }),
    updateProduct: staffProcedure.input(productUpdateSchema).mutation(async ({ ctx, input }) => {
      await validateProductWrite(input);
      // Snapshot stock before the write so a 0 -> >0 restock can be
      // detected below and fire wishlist "Ирэхээр мэдэгдэх" alerts.
      const stockBefore = input.stockQuantity !== undefined ? await getProductStockQuantity(input.id) : null;
      const product = await updateAdminProduct(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "product.updated", entityType: "product", entityId: product.id, metadata: { slug: product.slug, published: product.isPublished } });
      if (stockBefore === 0 && product.stockQuantity > 0) {
        const watchers = await getWishlistWatchersForProduct(product.id);
        for (const watcher of watchers) {
          if (!watcher.emailOptIn) continue;
          // No absolute site URL is configured anywhere in this app yet (see
          // ENV in server/_core/env.ts) — every other transactional email is
          // plain text with no link for the same reason, so this follows
          // suit rather than hard-coding a guessed production domain.
          await sendAccountEmail({
            to: watcher.email,
            subject: `SUGI ASAYAKE — "${product.name}" дахин нөөцөд орлоо`,
            content: `Таны хүслийн жагсаалтад байгаа "${product.name}" бүтээгдэхүүн дахин нөөцөд орлоо. Дуусахаас өмнө SUGI ASAYAKE дэлгүүрийн "${product.name}" хуудсаас шалгаарай.`,
          });
        }
        if (watchers.length) await clearWishlistNotifyFlagsForProduct(product.id);
      }
      return product;
    }),
    deleteProduct: staffProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminProduct(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "product.deleted", entityType: "product", entityId: input.id });
      return result;
    }),
    // PREMIUM-FEATURES.md TIER 2: lightweight moderation — a flat list an
    // admin/staff can filter through, not a pre-publish approval queue
    // (reviews are already gated by verified purchase before this).
    reviews: staffProcedure.query(() => getAdminReviews()),
    updateReviewApproval: staffProcedure.input(z.object({ id: z.number().int().positive(), isApproved: z.boolean() })).mutation(async ({ ctx, input }) => {
      const result = await setReviewApproval(input.id, input.isApproved);
      await logAdminAction({ actorUserId: ctx.user.id, action: input.isApproved ? "review.approved" : "review.hidden", entityType: "review", entityId: input.id });
      return result;
    }),
    deleteReview: staffProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminReview(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "review.deleted", entityType: "review", entityId: input.id });
      return result;
    }),
    // PREMIUM-FEATURES.md TIER 4.
    routines: staffProcedure.query(() => getAdminRoutines()),
    routineDetail: staffProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => getAdminRoutineDetail(input.id)),
    createRoutine: staffProcedure.input(routineWriteSchema).mutation(async ({ ctx, input }) => {
      if (await routineSlugExists(input.slug)) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ slug өмнө нь ашиглагдсан байна." });
      const routine = await createAdminRoutine(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "routine.created", entityType: "routine", entityId: routine.id, metadata: { slug: routine.slug } });
      return routine;
    }),
    updateRoutine: staffProcedure.input(routineUpdateSchema).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      if (changes.slug && await routineSlugExists(changes.slug, id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ slug өмнө нь ашиглагдсан байна." });
      const routine = await updateAdminRoutine({ id, ...changes });
      await logAdminAction({ actorUserId: ctx.user.id, action: "routine.updated", entityType: "routine", entityId: id });
      return routine;
    }),
    deleteRoutine: staffProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminRoutine(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "routine.deleted", entityType: "routine", entityId: input.id });
      return result;
    }),
    setRoutineSteps: staffProcedure.input(z.object({ routineId: z.number().int().positive(), steps: z.array(routineStepInputSchema).min(1).max(20) })).mutation(async ({ ctx, input }) => {
      try {
        const result = await setRoutineSteps(input.routineId, input.steps);
        await logAdminAction({ actorUserId: ctx.user.id, action: "routine.steps_updated", entityType: "routine", entityId: input.routineId, metadata: { stepCount: input.steps.length } });
        return result;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Алхмуудыг хадгалж чадсангүй." });
      }
    }),
    // Marketing popup/banner (new-arrival, sale, store event announcement).
    promotions: staffProcedure.query(() => getAdminSitePromotions()),
    createPromotion: staffProcedure.input(promotionWriteSchema).mutation(async ({ ctx, input }) => {
      const promotion = await createAdminSitePromotion({ ...input, message: input.message ?? null, imageUrl: input.imageUrl ?? null, ctaLabel: input.ctaLabel ?? null, ctaUrl: input.ctaUrl ?? null, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null }, ctx.user.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "promotion.created", entityType: "promotion", entityId: promotion.id, metadata: { headline: promotion.headline, isActive: promotion.isActive } });
      return promotion;
    }),
    updatePromotion: staffProcedure.input(promotionUpdateSchema).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      const promotion = await updateAdminSitePromotion({ id, ...changes }, ctx.user.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "promotion.updated", entityType: "promotion", entityId: id, metadata: { isActive: promotion.isActive } });
      return promotion;
    }),
    deletePromotion: staffProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminSitePromotion(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "promotion.deleted", entityType: "promotion", entityId: input.id });
      return result;
    }),
    // Manually-entered checkout discount codes ("SALE10").
    discountCodes: staffProcedure.query(() => getAdminDiscountCodes()),
    createDiscountCode: staffProcedure.input(discountCodeWriteSchema).mutation(async ({ ctx, input }) => {
      if (await discountCodeExists(input.code)) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ код өмнө нь ашиглагдсан байна." });
      const code = await createAdminDiscountCode(input, ctx.user.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "discount_code.created", entityType: "discount_code", entityId: code.id, metadata: { code: code.code } });
      return code;
    }),
    updateDiscountCode: staffProcedure.input(discountCodeUpdateSchema).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      if (changes.code && await discountCodeExists(changes.code, id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ код өмнө нь ашиглагдсан байна." });
      const code = await updateAdminDiscountCode({ id, ...changes });
      await logAdminAction({ actorUserId: ctx.user.id, action: "discount_code.updated", entityType: "discount_code", entityId: id });
      return code;
    }),
    deleteDiscountCode: staffProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminDiscountCode(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "discount_code.deleted", entityType: "discount_code", entityId: input.id });
      return result;
    }),
    // TIER 5: bulk publish/unpublish. Only touches isPublished, so none of
    // the slug/sku/category conflict checks in validateProductWrite apply —
    // this can't collide with another product the way a full edit could.
    bulkUpdateProductPublishStatus: staffProcedure.input(z.object({
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
    createCategory: staffProcedure.input(categoryWriteSchema).mutation(async ({ ctx, input }) => {
      await validateCategoryWrite(input);
      const category = await createAdminCategory(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "category.created", entityType: "category", entityId: category.id, metadata: { slug: category.slug } });
      return category;
    }),
    updateCategory: staffProcedure.input(categoryUpdateSchema).mutation(async ({ ctx, input }) => {
      await validateCategoryWrite(input);
      const category = await updateAdminCategory(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "category.updated", entityType: "category", entityId: category.id, metadata: { slug: category.slug } });
      return category;
    }),
    updateSiteMedia: staffProcedure.input(z.object({
      slotKey: siteMediaSlotSchema,
      imageUrl: z.string().trim().min(1).max(1_000),
      altText: nullableText(240),
    })).mutation(async ({ ctx, input }) => {
      const media = await upsertSiteMedia({ ...input, updatedByUserId: ctx.user.id });
      await logAdminAction({ actorUserId: ctx.user.id, action: "site_media.updated", entityType: "site_media", entityId: media.id, metadata: { slotKey: input.slotKey } });
      return media;
    }),
    clearSiteMedia: staffProcedure.input(z.object({ slotKey: siteMediaSlotSchema })).mutation(async ({ ctx, input }) => {
      await deleteSiteMedia(input.slotKey);
      await logAdminAction({ actorUserId: ctx.user.id, action: "site_media.cleared", entityType: "site_media", metadata: { slotKey: input.slotKey } });
      return { slotKey: input.slotKey };
    }),
    uploadProductImage: staffProcedure
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

        const extension = input.contentType === "image/jpeg" ? "jpg" : input.contentType === "image/png" ? "png" : "webp";
        const safeStem = input.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "product";
        const processed = await processUploadedImageOrThrow(buffer, input.contentType, IMAGE_MAX_DIMENSION.product);
        const stored = await storagePut(`catalog/products/${ctx.user.id}/${safeStem}.${extension}`, processed, input.contentType);
        return { url: stored.url, key: stored.key };
      }),
    uploadSiteMediaImage: staffProcedure
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
        const extension = input.contentType === "image/jpeg" ? "jpg" : input.contentType === "image/png" ? "png" : "webp";
        const safeStem = input.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "site-media";
        const processed = await processUploadedImageOrThrow(buffer, input.contentType, IMAGE_MAX_DIMENSION.siteMedia);
        const stored = await storagePut(`site-media/${ctx.user.id}/${safeStem}-${Date.now()}.${extension}`, processed, input.contentType);
        return { url: stored.url, key: stored.key };
      }),
  }),
});

export type AppRouter = typeof appRouter;
