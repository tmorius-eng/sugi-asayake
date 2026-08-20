import { COOKIE_NAME, GUEST_CART_COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getGuestCartCookieOptions, getSessionCookieOptions } from "./_core/cookies";
import { notifyOwner, sendAccountEmail } from "./_core/notification";
import { systemRouter } from "./_core/systemRouter";
import { signSessionToken, type TrpcContext } from "./_core/context";
import { hashPassword, verifyPassword } from "./_core/password";
import {
  acceptStaffInvitation,
  addCartItem,
  bumpUserSessionVersion,
  type CartOwner,
  categoryExists,
  createAdminCategory,
  createAdminPost,
  createAdminProduct,
  createEmailVerificationToken,
  createOrderFromActiveCart,
  createPasswordResetToken,
  getActiveCartForOwner,
  createQPayPaymentAttempt,
  createStaffInvitation,
  createUserWithPassword,
  deleteAdminPost,
  deleteAdminProduct,
  getAdminCategories,
  getAdminOrders,
  getAdminPosts,
  getAdminProducts,
  getAdminStaffInvitations,
  getAdminUsers,
  getCategoryWriteConflicts,
  getLatestQPayPaymentAttemptForOrder,
  getOrderForUser,
  getOrdersForUser,
  getProductBySlug,
  getProductWriteConflicts,
  getPublishedCatalog,
  getPublishedPosts,
  getPublishedPostBySlug,
  getSiteMedia,
  getStaffInvitationByTokenHash,
  getUserByEmail,
  logAdminAction,
  mergeGuestCartIntoUserCart,
  postSlugExists,
  resetPasswordWithToken,
  revokeStaffInvitation,
  deleteSiteMedia,
  touchUserLastSignedIn,
  upsertSiteMedia,
  updateAdminCategory,
  updateAdminOrder,
  updateAdminPost,
  updateAdminProduct,
  updateAdminUserRole,
  updateCartItemQuantity,
  verifyEmailWithToken,
} from "./db";
import { adminProcedure, authRateLimitedProcedure, authRateLimitedProtectedProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import { createQPayInvoice, getQPayAvailability } from "./qpay";
import { getCategoryWriteViolation, getProductWriteViolation } from "./catalog-validation";
import { siteMediaSlotKeys } from "../shared/site-media";

const slugSchema = z.string().trim().min(2).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.");
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

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
const staffRoleSchema = z.enum(["user", "admin"]);
const siteMediaSlotSchema = z.enum(siteMediaSlotKeys);
const invitationTokenSchema = z.string().trim().min(32).max(256);
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

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

async function sendVerificationEmail(userId: number, email: string, originInput: string) {
  const origin = parseAppOrigin(originInput);
  const token = randomBytes(32).toString("base64url");
  await createEmailVerificationToken({ userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  const verifyUrl = `${origin.origin}/verify-email/${token}`;
  await sendAccountEmail({
    to: email,
    subject: "SUGI ASAYAKE — Имэйл хаягаа баталгаажуулна уу",
    content: `Бүртгэлээ баталгаажуулахын тулд доорх холбоос дээр дарна уу (24 цагийн дотор хүчинтэй):\n\n${verifyUrl}`,
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
    register: authRateLimitedProcedure
      .input(z.object({
        email: z.string().trim().email().max(320),
        password: z.string().min(8).max(200),
        name: z.string().trim().min(1).max(160).optional(),
        origin: z.string().url().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const passwordHash = await hashPassword(input.password);
        let user;
        try {
          user = await createUserWithPassword({ email: input.email, passwordHash, name: input.name ?? null });
        } catch (error) {
          throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Энэ имэйлээр бүртгэл үүссэн байна." });
        }
        const token = await signSessionToken(user.id, user.sessionVersion);
        ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));
        await mergeGuestCartAndClearCookie(ctx, user.id);
        // Best-effort: a failed verification email should never block registration.
        if (input.origin) {
          try {
            await sendVerificationEmail(user.id, user.email, input.origin);
          } catch (error) {
            console.error("[auth.register] Failed to send verification email", error);
          }
        }
        const { passwordHash: _omit, ...safeUser } = user;
        return safeUser;
      }),
    login: authRateLimitedProcedure
      .input(z.object({
        email: z.string().trim().email().max(320),
        password: z.string().min(1).max(200),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await getUserByEmail(input.email);
        const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
        if (!user || !valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Имэйл эсвэл нууц үг буруу байна." });
        }
        await touchUserLastSignedIn(user.id);
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
    requestPasswordReset: authRateLimitedProcedure
      .input(z.object({ email: z.string().trim().email().max(320), origin: z.string().url().max(500) }))
      .mutation(async ({ input }) => {
        const origin = parseAppOrigin(input.origin);
        const user = await getUserByEmail(input.email);
        // Always return the same generic response whether or not the email is
        // registered, so this endpoint can't be used to enumerate accounts.
        if (user) {
          const token = randomBytes(32).toString("base64url");
          await createPasswordResetToken({ userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
          const resetUrl = `${origin.origin}/reset-password/${token}`;
          await sendAccountEmail({
            to: user.email,
            subject: "SUGI ASAYAKE — Нууц үг сэргээх",
            content: `Та SUGI ASAYAKE дэлгүүрийн нууц үгээ сэргээх хүсэлт илгээлээ. Доорх холбоос дээр дарж 1 цагийн дотор шинэ нууц үг тохируулна уу:\n\n${resetUrl}\n\nХэрэв та энэ хүсэлтийг илгээгээгүй бол энэ имэйлийг үл тоомсорлож болно.`,
          });
        }
        return { success: true } as const;
      }),
    resetPassword: authRateLimitedProcedure
      .input(z.object({ token: invitationTokenSchema, password: z.string().min(8).max(200) }))
      .mutation(async ({ input }) => {
        const passwordHash = await hashPassword(input.password);
        try {
          await resetPasswordWithToken({ tokenHash: tokenHash(input.token), passwordHash });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Нууц үг сэргээж чадсангүй." });
        }
        return { success: true } as const;
      }),
    verifyEmail: publicProcedure
      .input(z.object({ token: invitationTokenSchema }))
      .mutation(async ({ input }) => {
        try {
          await verifyEmailWithToken({ tokenHash: tokenHash(input.token) });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Имэйл хаягийг баталгаажуулж чадсангүй." });
        }
        return { success: true } as const;
      }),
    resendVerificationEmail: authRateLimitedProtectedProcedure
      .input(z.object({ origin: z.string().url().max(500) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Таны бүртгэлд имэйл хаяг байхгүй байна." });
        if (ctx.user.emailVerifiedAt) return { success: true, alreadyVerified: true } as const;
        await sendVerificationEmail(ctx.user.id, ctx.user.email, input.origin);
        return { success: true, alreadyVerified: false } as const;
      }),
  }),
  catalog: router({
    list: publicProcedure.query(() => getPublishedCatalog()),
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(200) })).query(({ input }) => getProductBySlug(input.slug)),
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
    addItem: publicProcedure.input(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(100) })).mutation(async ({ ctx, input }) => {
      try {
        return await addCartItem({ owner: resolveCartOwnerForWrite(ctx), ...input });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to add this item to the cart." });
      }
    }),
    updateItemQuantity: publicProcedure.input(z.object({ itemId: z.number().int().positive(), quantity: z.number().int().min(0).max(100) })).mutation(async ({ ctx, input }) => {
      try {
        return await updateCartItemQuantity({ owner: resolveCartOwnerForWrite(ctx), ...input });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to update this cart item." });
      }
    }),
  }),
  checkout: router({
    createOrder: publicProcedure.input(z.object({
      customerName: z.string().trim().min(2).max(160),
      customerPhone: z.string().trim().min(6).max(40),
      customerEmail: z.string().trim().email().max(320).nullable().optional(),
      deliveryMethod: z.enum(["ub_delivery", "store_pickup"]),
      deliveryAddress: z.string().trim().min(8).max(2_000).nullable().optional(),
      pickupBranch: z.enum(["Орос элчингийн салбар", "Их наяд плаза салбар", "Яармаг FOOD CITY салбар"]).or(z.literal("")).nullable().optional(),
      paymentMethod: z.enum(["qpay", "bank_transfer", "card", "cash_on_delivery"]),
    }).superRefine((value, context) => {
      if (value.deliveryMethod === "ub_delivery" && !value.deliveryAddress) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "A delivery address is required for Ulaanbaatar delivery.", path: ["deliveryAddress"] });
      }
      if (value.deliveryMethod === "store_pickup" && !value.pickupBranch) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Select a SUGI branch for store pickup.", path: ["pickupBranch"] });
      }
    })).mutation(async ({ ctx, input }) => {
      try {
        return await createOrderFromActiveCart({ owner: resolveCartOwnerForWrite(ctx), ...input });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to place this order." });
      }
    }),
  }),
  orders: router({
    mine: protectedProcedure.query(({ ctx }) => getOrdersForUser(ctx.user.id)),
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
    products: adminProcedure.query(() => getAdminProducts()),
    categories: adminProcedure.query(() => getAdminCategories()),
    orders: adminProcedure.query(() => getAdminOrders()),
    posts: adminProcedure.query(() => getAdminPosts()),
    siteMedia: adminProcedure.query(() => getSiteMedia()),
    users: adminProcedure.query(() => getAdminUsers()),
    staffInvitations: adminProcedure.query(() => getAdminStaffInvitations()),
    inviteStaff: adminProcedure.input(z.object({ email: z.string().trim().email().max(320), role: staffRoleSchema.default("user"), origin: z.string().url().max(500) })).mutation(async ({ ctx, input }) => {
      const origin = new URL(input.origin);
      if (origin.protocol !== "https:" && origin.protocol !== "http:") throw new TRPCError({ code: "BAD_REQUEST", message: "A secure application origin is required for the invitation link." });
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
    updateOrder: adminProcedure.input(orderUpdateSchema).mutation(async ({ ctx, input }) => {
      try {
        const order = await updateAdminOrder(input);
        await logAdminAction({ actorUserId: ctx.user.id, action: "order.updated", entityType: "order", entityId: order.id, metadata: { status: order.status, deliveryTrackingRef: order.deliveryTrackingRef } });
        return order;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to update order." });
      }
    }),
    createPost: adminProcedure.input(postWriteSchema).mutation(async ({ ctx, input }) => {
      await validatePostSlug(input.slug);
      const post = await createAdminPost({ ...input, createdByUserId: ctx.user.id });
      await logAdminAction({ actorUserId: ctx.user.id, action: "post.created", entityType: "post", entityId: post.id, metadata: { slug: post.slug, published: post.isPublished } });
      return post;
    }),
    updatePost: adminProcedure.input(postUpdateSchema).mutation(async ({ ctx, input }) => {
      await validatePostSlug(input.slug, input.id);
      const post = await updateAdminPost(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "post.updated", entityType: "post", entityId: post.id, metadata: { slug: post.slug, published: post.isPublished } });
      return post;
    }),
    deletePost: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminPost(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "post.deleted", entityType: "post", entityId: input.id });
      return result;
    }),
    createProduct: adminProcedure.input(productWriteSchema).mutation(async ({ ctx, input }) => {
      await validateProductWrite(input);
      const product = await createAdminProduct(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "product.created", entityType: "product", entityId: product.id, metadata: { slug: product.slug, published: product.isPublished } });
      return product;
    }),
    updateProduct: adminProcedure.input(productUpdateSchema).mutation(async ({ ctx, input }) => {
      await validateProductWrite(input);
      const product = await updateAdminProduct(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "product.updated", entityType: "product", entityId: product.id, metadata: { slug: product.slug, published: product.isPublished } });
      return product;
    }),
    deleteProduct: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteAdminProduct(input.id);
      await logAdminAction({ actorUserId: ctx.user.id, action: "product.deleted", entityType: "product", entityId: input.id });
      return result;
    }),
    createCategory: adminProcedure.input(categoryWriteSchema).mutation(async ({ ctx, input }) => {
      await validateCategoryWrite(input);
      const category = await createAdminCategory(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "category.created", entityType: "category", entityId: category.id, metadata: { slug: category.slug } });
      return category;
    }),
    updateCategory: adminProcedure.input(categoryUpdateSchema).mutation(async ({ ctx, input }) => {
      await validateCategoryWrite(input);
      const category = await updateAdminCategory(input);
      await logAdminAction({ actorUserId: ctx.user.id, action: "category.updated", entityType: "category", entityId: category.id, metadata: { slug: category.slug } });
      return category;
    }),
    updateSiteMedia: adminProcedure.input(z.object({
      slotKey: siteMediaSlotSchema,
      imageUrl: z.string().trim().min(1).max(1_000),
      altText: nullableText(240),
    })).mutation(async ({ ctx, input }) => {
      const media = await upsertSiteMedia({ ...input, updatedByUserId: ctx.user.id });
      await logAdminAction({ actorUserId: ctx.user.id, action: "site_media.updated", entityType: "site_media", entityId: media.id, metadata: { slotKey: input.slotKey } });
      return media;
    }),
    clearSiteMedia: adminProcedure.input(z.object({ slotKey: siteMediaSlotSchema })).mutation(async ({ ctx, input }) => {
      await deleteSiteMedia(input.slotKey);
      await logAdminAction({ actorUserId: ctx.user.id, action: "site_media.cleared", entityType: "site_media", metadata: { slotKey: input.slotKey } });
      return { slotKey: input.slotKey };
    }),
    uploadProductImage: adminProcedure
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
        const stored = await storagePut(`catalog/products/${ctx.user.id}/${safeStem}.${extension}`, buffer, input.contentType);
        return { url: stored.url, key: stored.key };
      }),
    uploadSiteMediaImage: adminProcedure
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
        const stored = await storagePut(`site-media/${ctx.user.id}/${safeStem}-${Date.now()}.${extension}`, buffer, input.contentType);
        return { url: stored.url, key: stored.key };
      }),
  }),
});

export type AppRouter = typeof appRouter;
