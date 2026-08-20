import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG } from "@shared/const";
import type { TrpcContext } from "./context";
import { checkRateLimit } from "./security";

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

// Admin or staff — day-to-day storefront operations (products, categories,
// orders, posts, media). Staff cannot touch user accounts/roles or see
// financial figures; those stay behind adminProcedure.
export const staffProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "staff") {
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

// Strict tier (8 attempts/15min/IP): brute-force/enumeration/abuse targets
// where each request is either security-sensitive (login, register,
// password reset) or writes a real business record (checkout — it also
// decrements stock, so leaving it under only the general 300/15min cap would
// let one IP place enough garbage orders to exhaust inventory).
const strictRateLimit = rateLimitMiddleware("strict", 8, 15 * 60 * 1000);
export const strictRateLimitedProcedure = publicProcedure.use(strictRateLimit);
export const strictRateLimitedProtectedProcedure = protectedProcedure.use(strictRateLimit);

// Moderate tier (30 attempts/15min/IP): cart mutations. Guest checkout means
// these no longer require an account first, so an anonymous visitor could
// otherwise spam `carts` rows with no friction at all — but a real shopper
// legitimately adding several different products needs more headroom than
// the strict tier gives.
const moderateRateLimit = rateLimitMiddleware("moderate", 30, 15 * 60 * 1000);
export const moderateRateLimitedProcedure = publicProcedure.use(moderateRateLimit);
