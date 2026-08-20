import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG } from "@shared/const";
import type { TrpcContext } from "./context";
import { checkAuthRateLimit } from "./security";

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

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// Applied to auth endpoints that are attractive brute-force/enumeration
// targets (login, register, password reset, resend verification). Keyed by
// IP + procedure path, independent of the general `/api/trpc` traffic cap.
const authRateLimit = t.middleware(({ ctx, path, next }) => {
  const key = `${path}:${ctx.req.ip || ctx.req.socket.remoteAddress || "unknown"}`;
  const result = checkAuthRateLimit(key);
  if (!result.allowed) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Хэт олон оролдлого хийлээ. ${result.retryAfterSeconds} секундын дараа дахин оролдоно уу.` });
  }
  return next();
});

export const authRateLimitedProcedure = publicProcedure.use(authRateLimit);
export const authRateLimitedProtectedProcedure = protectedProcedure.use(authRateLimit);
