import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG, INTERNAL_ERR_MSG } from "@shared/const";
import type { TrpcContext } from "./context";
import { ENV } from "./env";
import { checkRateLimit } from "./security";
import { checkPersistentRateLimit } from "./persistentRateLimit";
import { assertFaceProofForPanelRole } from "./faceProof";

/**
 * Аудит 2026-09-20 (P0-2): tRPC нь procedure-ийн шидсэн АЛЬ Ч алдааны
 * `message`-ийг клиент рүү илгээдэг, клиент бүр `messageFrom(error)`-оор toast
 * болгодог. Тиймээс `connect ETIMEDOUT`, `ER_LOCK_WAIT_TIMEOUT … UPDATE
 * product_variants …` зэрэг driver/SQL мессеж production-д хэрэглэгчид харагдаж,
 * хүснэгтийн нэр, дотоод бүтэц алдагдаж байв. Мөн `catch → BAD_REQUEST
 * (error.message)` ороолт олон газар байгаа тул зөвхөн INTERNAL кодыг маскдах нь
 * хангалтгүй — мессежийн ХЭЛБЭРИЙГ ч шалгана.
 *
 * Цэвэр функц: production эсэхийг параметрээр авдаг тул unit-тестлэгдэнэ
 * (server/_core/trpc-errors.test.ts). Dev-д хөндөхгүй — stack хэрэгтэй.
 */
const INTERNAL_DETAIL_PATTERN = /\b(ER_[A-Z_]+|ECONN(REFUSED|RESET)|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|sqlMessage|sqlState|Duplicate entry|Unknown column|Table '[^']*' doesn't exist|SELECT |INSERT INTO|UPDATE [a-z_]+ SET|DELETE FROM|TypeError:|ReferenceError:|Cannot read propert|is not a function|undefined is not|null is not)|\bat .+:\d+:\d+\b/;

/**
 * `catch → error.message` ороолтод зориулсан (2026-09-27): мессеж нь хэрэглэгчид
 * зориулсан МОНГОЛ өгүүлбэр бол түүнийг, эс бөгөөс (провайдерийн англи алдаа
 * "verify.mn request failed (500): …", env нэр "VERIFY_MN_API_KEY …", driver
 * алдаа) `fallback`-ийг буцаана. `maskErrorShape` зөвхөн хэлбэрээр таньдаг тул
 * эдгээр нь өмнө нь клиент/админ руу шууд гардаг байв.
 */
/** Driver/stack хэлбэрийн дотоод текст эсэх (2026-09-27). */
export function isInternalErrorText(message: string): boolean {
  return INTERNAL_DETAIL_PATTERN.test(message);
}

export function userFacingMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (!message) return fallback;
  if (INTERNAL_DETAIL_PATTERN.test(message)) return fallback;
  if (/\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b/.test(message)) return fallback;
  if (!/[Ѐ-ӿ]/.test(message)) return fallback;
  return message;
}

/**
 * Оролтын шалгалтын алдааг ХҮНИЙ уншихаар өгүүлбэр болгоно (2026-09-23).
 *
 * zod схем унавал tRPC нь `message`-д асуудлын жагсаалтыг JSON-оор хийж
 * илгээдэг бөгөөд клиент бүр түүнийг шууд toast болгодог — худалдан авагч
 * `[{"origin":"string","code":"invalid_format",…}]` гэсэн хана хардаг байв
 * (Checkout-ийн имэйл/хаяг, бүртгэлийн 8 тэмдэгтийн нууц үг гэх мэт).
 * Клиент нь серверээс БАГА шалгадаг тул энэ зам бодитоор хүрдэг.
 *
 * Талбарын нэрийг монголоор нэрлэж, zod-ийн нийтлэг кодуудыг монгол
 * өгүүлбэр болгоно; танихгүй тохиолдолд zod-ийн өөрийн мессежийг үлдээнэ.
 */
const FIELD_LABELS_MN: Record<string, string> = {
  customerName: "нэр",
  customerPhone: "утасны дугаар",
  customerEmail: "имэйл хаяг",
  deliveryAddress: "хүргэлтийн хаяг",
  pickupBranch: "авах салбар",
  password: "нууц үг",
  name: "нэр",
  phone: "утасны дугаар",
  email: "имэйл хаяг",
  comment: "сэтгэгдэл",
  rating: "үнэлгээ",
  addressLine: "хаяг",
  recipientName: "хүлээн авагчийн нэр",
  label: "нэр",
};

type ZodIssueLike = { path?: unknown[]; message?: string; code?: string; minimum?: number; maximum?: number; origin?: string };

export function humaniseValidationMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("[")) return null;
  let issues: ZodIssueLike[];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    issues = parsed as ZodIssueLike[];
  } catch {
    return null;
  }
  const parts: string[] = [];
  for (const issue of issues.slice(0, 4)) {
    if (!issue || typeof issue !== "object") continue;
    const rawPath = Array.isArray(issue.path) ? issue.path.filter(part => typeof part === "string") as string[] : [];
    // 2026-09-23: тааруулаагүй замыг АНГЛИАР үзүүлэхгүй ("items.quantity"
    // гэж худалдан авагчид гаргахгүй) — нэр нь толинд байхгүй бол зөвхөн
    // тайлбарыг үзүүлнэ.
    const field = rawPath.length ? FIELD_LABELS_MN[rawPath[rawPath.length - 1]] ?? null : null;
    // zod 4-ийн `origin` нь шалгалт ямар төрөл дээр унасныг хэлнэ: "тэмдэгт"
    // гэдэг нь зөвхөн мөрд зөв (өмнө нь `rating: min(1)` → "үнэлгээ —
    // хамгийн багадаа 1 тэмдэгт" гэж гардаг байв).
    const unit = issue.origin === "number" || issue.origin === "int" || issue.origin === "bigint" ? ""
      : issue.origin === "array" || issue.origin === "set" ? " ширхэг"
        : " тэмдэгт";
    let detail: string;
    if (issue.code === "invalid_type") detail = "заавал бөглөнө";
    else if (issue.code === "too_small") detail = typeof issue.minimum === "number" ? `хамгийн багадаа ${issue.minimum}${unit}` : "хэт бага";
    else if (issue.code === "too_big") detail = typeof issue.maximum === "number" ? `хамгийн ихдээ ${issue.maximum}${unit}` : "хэт их";
    else if (issue.code === "invalid_format" || issue.code === "invalid_string") detail = "буруу байна";
    else detail = typeof issue.message === "string" && issue.message.trim() ? issue.message.trim() : "буруу байна";
    parts.push(field ? `${field} — ${detail}` : detail);
  }
  if (!parts.length) return null;
  const more = issues.length > parts.length ? ` (болон өөр ${issues.length - parts.length})` : "";
  return `Оруулсан мэдээлэл буруу байна: ${parts.join("; ")}${more}.`;
}

export function maskErrorShape<T extends { message: string }>(shape: T, code: string, isProduction: boolean): T {
  // Шалгалтын JSON-г хэлбэржүүлэх нь dev-д Ч хэрэгтэй — тэр мессежийг
  // хэрэглэгч биш, зөвхөн хөгжүүлэгч уншиж чаддаг байсан.
  const humanised = code === "BAD_REQUEST" ? humaniseValidationMessage(shape.message) : null;
  const withMessage = humanised ? { ...shape, message: humanised } : shape;
  if (!isProduction) return withMessage;
  if (code === "INTERNAL_SERVER_ERROR" || INTERNAL_DETAIL_PATTERN.test(withMessage.message)) {
    return { ...withMessage, message: INTERNAL_ERR_MSG };
  }
  return withMessage;
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return maskErrorShape(shape, error.code, ENV.isProduction);
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Every admin-panel procedure runs behind the face proof (2026-09-12). Until
// then the gate was a screen: the panel asked for the face, but the API it
// called did not, so an expired proof (or none) still let every call through.
// See server/_core/faceProof.ts for the incident. Customer-facing procedures
// stay on protectedProcedure -- a shopper never has a proof and never needs one.
const panelProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await assertFaceProofForPanelRole({ req: ctx.req, user: ctx.user });
  return next({ ctx });
});

// Full admin only — user management (role changes, suspend, force logout,
// staff invitations) and anything financial (revenue, active-user counts).
// TIER 3: `staff` is a separate, narrower role (see staffProcedure below),
// not a synonym for admin.
export const adminProcedure = panelProcedure.use(({ ctx, next }) => {
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
export const staffProcedure = panelProcedure.use(({ ctx, next }) => {
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
export const financeProcedure = panelProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "finance") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// Admin or marketing — reviews, routines, promotions, discount codes,
// featured brands, homepage site media/text, customer segments, campaigns.
// Anything that's a customer-facing content/merchandising lever, but not
// money (financeProcedure) or stock-keeping (warehouseProcedure).
export const marketingProcedure = panelProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "marketing") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// Admin or warehouse — products, variants, categories, order
// status/fulfillment, CSV import. The old staffProcedure's catalog/order
// scope, minus posts/media (now staff-only) and minus financial figures
// (never in scope for staff and still isn't here).
export const warehouseProcedure = panelProcedure.use(({ ctx, next }) => {
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
export const anyStaffProcedure = panelProcedure.use(({ ctx, next }) => {
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
export const catalogReadProcedure = panelProcedure.use(({ ctx, next }) => {
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
export const contentReadProcedure = panelProcedure.use(({ ctx, next }) => {
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
export const ordersReadProcedure = panelProcedure.use(({ ctx, next }) => {
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
export const usersReadProcedure = panelProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "finance") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

// 2026-09-11 (Phase 3, "Бараа хүлээн авах"): receiving goods and counting
// shelves by barcode scan. Opens to store staff as well as warehouse --
// the store consultants are the ones who receive deliveries. Which BRANCH
// each may act on (staff: only their own) is checked per call in
// server/inventory.ts (assertCanOperateOnBranch), not here.
export const inventoryProcedure = panelProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "warehouse" && ctx.user.role !== "staff") {
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
// decrements stock, so leaving it under only the general 1200/15min cap would
// let one IP place enough garbage orders to exhaust inventory).
const strictRateLimit = persistentRateLimitMiddleware("strict", 8, 15 * 60 * 1000);
export const strictRateLimitedProcedure = publicProcedure.use(strictRateLimit);
export const strictRateLimitedProtectedProcedure = protectedProcedure.use(strictRateLimit);

// Аудит 2026-09-20 (P1-1): login ба checkout нь strict tier-ээс салсан. Тэр tier
// АМЖИЛТТАЙ оролдлогыг ч тоолдог тул нэг IP-ийн ард 9 дэх хэрэглэгч (оффисын
// NAT, үүрэн операторын CGNAT — Монголд түгээмэл) нэвтэрч/захиалж чадахгүй байв.
// 20/15мин/IP хэвээр DB дээр тоологдоно (олон instance-д хүчинтэй); login дээр
// нэмэлтээр ДАНС тус бүрийн lockout (server/routers.ts, LOGIN_LOCKOUT_*) байдаг
// тул IP-ийн босгыг сулруулсан нь brute-force-ийн орон зайг нээхгүй. Бүртгэл,
// нууц үг сэргээх, царай бүртгэх нь ховор үйлдэл тул strict хэвээр.
const loginRateLimit = persistentRateLimitMiddleware("login", 20, 15 * 60 * 1000);
export const loginRateLimitedProcedure = publicProcedure.use(loginRateLimit);
// Admin-ийн нууц үгийн step-up (faceAuth.confirmPassword, 2026-09-22): нэвтрэлттэй
// ижил 20/15мин/IP tier + ДАНС тус бүрийн lockout. Strict tier (8, амжилтыг ч
// тоолдог) дээр байвал нэг оффисын NAT-ын ард 9 дэх ажилтан түгжигдэнэ.
export const loginRateLimitedProtectedProcedure = protectedProcedure.use(loginRateLimit);
const checkoutRateLimit = persistentRateLimitMiddleware("checkout", 20, 15 * 60 * 1000);
export const checkoutRateLimitedProcedure = publicProcedure.use(checkoutRateLimit);

// Moderate tier (30 attempts/15min/IP): cart mutations. Guest checkout means
// these no longer require an account first, so an anonymous visitor could
// otherwise spam `carts` rows with no friction at all — but a real shopper
// legitimately adding several different products needs more headroom than
// the strict tier gives.
const moderateRateLimit = rateLimitMiddleware("moderate", 30, 15 * 60 * 1000);
export const moderateRateLimitedProcedure = publicProcedure.use(moderateRateLimit);
export const moderateRateLimitedProtectedProcedure = protectedProcedure.use(moderateRateLimit);

// Lenient tier (600 attempts/15min/IP): best-effort pageview telemetry
// (Tier E analytics), fired on every route change. Deliberately its own
// generous bucket, separate from the blanket 1200/15min limitApiTraffic
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
