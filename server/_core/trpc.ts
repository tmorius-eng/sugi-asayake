import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG } from "@shared/const";
import type { TrpcContext } from "./context";
import { checkRateLimit } from "./security";
import { checkPersistentRateLimit } from "./persistentRateLimit";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Full admin only — user management (role changes, suspend, force logout,
// staff invitations) and anything financial (revenue, active-user counts).
// TIER 3: `staff` is a separate, narrower role (see staffProcedure below),
// not a synonym for admin.
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// 2026-09-08 (Admin overhaul, Phase A): "staff" narrows to posts/media only
// (see server/routers.ts for the per-endpoint reassignment, Phase B) — it is
// no longer the catch-all "anyone but admin" role. Its middleware LOGIC is
// unchanged (still exactly "admin or staff"); what changes is which router
// procedures use it.
export const staffProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "staff") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// Admin or finance — analytics/P&L/COGS/margin/CAC/conversion, marketing
// spend input, and refund authorization (recording a refund amount, flipping
// paymentStatus to "refunded"). Deliberately separate from warehouseProcedure
// below: moving an order through its fulfillment ladder is not the same
// trust boundary as actually sending money back out.
export const financeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "finance") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// Admin or marketing — reviews, routines, promotions, discount codes,
// featured brands, homepage site media/text, customer segments, campaigns.
// Anything that's a customer-facing content/merchandising lever, but not
// money (financeProcedure) or stock-keeping (warehouseProcedure).
export const marketingProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "marketing") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// Admin or warehouse — products, variants, categories, order
// status/fulfillment, CSV import. The old staffProcedure's catalog/order
// scope, minus posts/media (now staff-only) and minus financial figures
// (never in scope for staff and still isn't here).
export const warehouseProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "warehouse") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// Any non-"user" role — the shared admin dashboard shell every department
// lands on (dashboardSummary/systemHealth/search). These already redact
// financial/user figures per-role internally (ctx.user.role === "admin" ?
// full : null, see server/routers.ts) — this middleware only gates entry,
// not what's inside the response.
export const anyStaffProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role === "user") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// Read-only catalog access shared across two departments: warehouse (owns
// products/categories) and marketing (whose Routines composer needs the
// product picker, and whose homepage category tiles reference categories).
// Writes stay warehouseProcedure-only — this never grants marketing a way to
// create/edit/delete a product or category, only to read the list.
export const catalogReadProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "warehouse" && ctx.user.role !== "marketing") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// Read-only content access shared across two departments: staff (owns posts)
// and marketing (whose shared Content Calendar reads both posts and
// promotions, and whose homepage-content editing needs post context). Writes
// stay staffProcedure-only for posts, marketingProcedure-only for
// promotions — this never grants marketing a way to create/edit/delete a
// post, only to read the list.
export const contentReadProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "staff" && ctx.user.role !== "marketing") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// Read-only order access shared across two departments: warehouse (owns
// fulfillment) and finance (Phase E's refund authority needs to find a
// returned-but-unrefunded order before it can act on it -- the plan that
// added admin.refundOrder as financeProcedure-only didn't also widen the
// read side, which would have left finance able to call refundOrder but
// never able to see which order to call it on). Writes (updateOrder/
// bulkUpdateOrderStatus) stay warehouseProcedure-only -- this never grants
// finance a way to change fulfillment status, only to read the list.
export const ordersReadProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "warehouse" && ctx.user.role !== "finance") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// "Controls everything" admin overhaul (2026-09-08, Phase H): the exact
// same shape of gap ordersReadProcedure above documents and fixes --
// adjustStoreCredit was scoped financeProcedure (a real money decision,
// same tier as refundOrder), but the Users list/detail reads it depends on
// (to find the customer to credit in the first place) were adminProcedure-
// only, which would have left finance able to call adjustStoreCredit but
// never able to reach a user to call it on. Writes (suspend/unsuspend,
// role changes, phone edits, the loyalty-adjustment bridge) stay
// adminProcedure-only -- this never grants finance a way to change a user
// account, only to read it.
export const usersReadProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "finance") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

function requestKey(ctx: TrpcContext): string {
  return ctx.req.ip || ctx.req.socket.remoteAddress || "unknown";
}

function rateLimitMiddleware(bucketName: string, maxAttempts: number, windowMs: number) {
  return t.middleware(({ ctx, path, next }) => {
    const result = checkRateLimit(bucketName, `${path}:${requestKey(ctx)}`, maxAttempts, windowMs);
    if (!result.allowed) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Хэт олон оролдлого хийлээ. ${result.retryAfterSeconds} секундын дараа дахин оролдоно уу.` });
    }
    return next();
  });
}

// Audit 2026-09-09 (R3): the strict tiers below count in the shared database
// (server/_core/persistentRateLimit.ts) rather than this process's memory,
// so an attacker cannot get a fresh budget from every server instance or
// every restart. The in-memory rateLimitMiddleware above stays for the
// high-volume cart/telemetry tiers, where a DB round trip per call would
// cost more than it protects.
function persistentRateLimitMiddleware(bucketName: string, maxAttempts: number, windowMs: number) {
  return t.middleware(async ({ ctx, path, next }) => {
    const result = await checkPersistentRateLimit(bucketName, `${path}:${requestKey(ctx)}`, maxAttempts, windowMs);
    if (!result.allowed) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Хэт олон оролдлого хийлээ. ${result.retryAfterSeconds} секундын дараа дахин оролдоно уу.` });
    }
    return next();
  });
}

// Strict tier (8 attempts/15min/IP): brute-force/enumeration/abuse targets
// where each request is either security-sensitive (login, register,
// password reset) or writes a real business record (checkout — it also
// decrements stock, so leaving it under only the general 300/15min cap would
// let one IP place enough garbage orders to exhaust inventory).
const strictRateLimit = persistentRateLimitMiddleware("strict", 8, 15 * 60 * 1000);
export const strictRateLimitedProcedure = publicProcedure.use(strictRateLimit);
export const strictRateLimitedProtectedProcedure = protectedProcedure.use(strictRateLimit);

// Moderate tier (30 attempts/15min/IP): cart mutations. Guest checkout means
// these no longer require an account first, so an anonymous visitor could
// otherwise spam `carts` rows with no friction at all — but a real shopper
// legitimately adding several different products needs more headroom than
// the strict tier gives.
const moderateRateLimit = rateLimitMiddleware("moderate", 30, 15 * 60 * 1000);
export const moderateRateLimitedProcedure = publicProcedure.use(moderateRateLimit);

// Lenient tier (600 attempts/15min/IP): best-effort pageview telemetry
// (Tier E analytics), fired on every route change. Deliberately its own
// generous bucket, separate from the blanket 300/15min limitApiTraffic
// budget every tRPC call already shares — this must never be the thing
// that throttles a real shopper's cart/checkout calls from the same IP.
const lenientRateLimit = rateLimitMiddleware("lenient", 600, 15 * 60 * 1000);
export const lenientRateLimitedProcedure = publicProcedure.use(lenientRateLimit);

// Phone-verify tier (3 attempts/15min/IP), tighter than the general "strict"
// tier (8/15min): every verify.mn session creation costs the END USER 150₮
// once they text back the code, whether or not it's a legitimate attempt —
// unlike a free email OTP resend, spamming this endpoint has a real victim
// cost, not just a nuisance-abuse cost. Only wraps auth.startPhoneVerification
// (session creation); the status-poll and reset/attach procedures don't
// trigger a new SMS, so they stay on the standard strict tier.
const phoneVerifyRateLimit = persistentRateLimitMiddleware("phoneVerify", 3, 15 * 60 * 1000);
export const phoneVerifyRateLimitedProcedure = publicProcedure.use(phoneVerifyRateLimit);
