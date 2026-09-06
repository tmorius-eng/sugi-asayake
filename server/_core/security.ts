import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 300;

function clientKey(request: Request) {
  return request.ip || request.socket.remoteAddress || "unknown";
}

// Only enforced in production: Vite's dev server injects its own inline
// module-loader script and uses `eval`-based sourcemaps for HMR, which a
// strict script-src would break. The production build has no inline scripts
// (everything is compiled into hashed external chunks), so it can run under
// the full policy below.
//
// NOTE: if a real analytics provider is ever wired up via
// VITE_ANALYTICS_ENDPOINT (see client/index.html), that host needs to be
// added to script-src/connect-src here too, or its request will be blocked.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // 'unsafe-inline' here covers React/Radix/Tailwind's runtime `style={...}`
  // attributes, which CSP has no practical nonce-based alternative for.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // Product/site-media images are served from an admin-configured S3/CDN
  // host (S3_PUBLIC_BASE_URL) that varies per deployment, so it can't be
  // pinned to a single origin here.
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export function setSecurityHeaders(request: Request, response: Response, next: NextFunction) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  if (process.env.NODE_ENV === "production") {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  }
  next();
}

export function limitApiTraffic(request: Request, response: Response, next: NextFunction) {
  if (!request.path.startsWith("/api/trpc")) return next();
  const now = Date.now();
  if (buckets.size > 10_000) sweepExpired(buckets, now);
  const key = clientKey(request);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) {
    response.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
    return response.status(429).json({ error: "Too many requests. Please try again shortly." });
  }
  next();
}

// Stricter, per-procedure limit for endpoints that are attractive
// brute-force/enumeration/abuse targets (login, register, password reset,
// checkout — anything that writes a row or costs real money to process). The
// general `/api/trpc` limit above (300/15min) is far too loose to stop that
// on its own. Each call site gets its own bucket map (keyed by name) so a
// generous cart-browsing limit and a strict checkout limit don't share state.
const namedRateLimitBuckets = new Map<string, Map<string, Bucket>>();

// A single Map growing forever (one entry per distinct IP ever seen) is a
// memory leak, and wiping the *entire* map at a size threshold resets every
// still-active bucket too — including ones that are supposed to be blocking
// someone right now. Sweep only the individual entries that have actually
// expired instead.
function sweepExpired(buckets: Map<string, Bucket>, now: number) {
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) buckets.delete(key);
  });
}

export function checkRateLimit(bucketName: string, key: string, maxAttempts: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  let buckets = namedRateLimitBuckets.get(bucketName);
  if (!buckets) {
    buckets = new Map();
    namedRateLimitBuckets.set(bucketName, buckets);
  }
  const now = Date.now();
  if (buckets.size > 5_000) sweepExpired(buckets, now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > maxAttempts) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

// The QPay callback (`/api/payments/qpay/callback`) sits outside `/api/trpc`,
// so it was previously exempt from `limitApiTraffic` entirely — anyone could
// hammer it with garbage invoice IDs. Each real callback from QPay is
// infrequent (one or two per order), so this cap is generous for legitimate
// traffic while still bounding abuse.
const qpayCallbackBuckets = new Map<string, Bucket>();
const QPAY_CALLBACK_WINDOW_MS = 60 * 1000;
const QPAY_CALLBACK_MAX_REQUESTS = 30;

export function limitQPayCallbackTraffic(request: Request, response: Response, next: NextFunction) {
  const now = Date.now();
  if (qpayCallbackBuckets.size > 10_000) sweepExpired(qpayCallbackBuckets, now);
  const key = clientKey(request);
  const bucket = qpayCallbackBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    qpayCallbackBuckets.set(key, { count: 1, resetAt: now + QPAY_CALLBACK_WINDOW_MS });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > QPAY_CALLBACK_MAX_REQUESTS) {
    response.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
    return response.status(429).json({ ok: false, error: "Too many requests. Please try again shortly." });
  }
  next();
}

// The verify.mn callback (`/api/verify-mn/callback`) sits outside
// `/api/trpc` too, same reasoning as limitQPayCallbackTraffic above — a
// separate bucket so the two integrations' webhook traffic never shares
// state with each other or with anything else.
const verifyMnCallbackBuckets = new Map<string, Bucket>();
const VERIFY_MN_CALLBACK_WINDOW_MS = 60 * 1000;
const VERIFY_MN_CALLBACK_MAX_REQUESTS = 30;

export function limitVerifyMnCallbackTraffic(request: Request, response: Response, next: NextFunction) {
  const now = Date.now();
  if (verifyMnCallbackBuckets.size > 10_000) sweepExpired(verifyMnCallbackBuckets, now);
  const key = clientKey(request);
  const bucket = verifyMnCallbackBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    verifyMnCallbackBuckets.set(key, { count: 1, resetAt: now + VERIFY_MN_CALLBACK_WINDOW_MS });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > VERIFY_MN_CALLBACK_MAX_REQUESTS) {
    response.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
    return response.status(429).json({ ok: false, error: "Too many requests. Please try again shortly." });
  }
  next();
}

// Audit finding BUG-007 (2026-09-06): a request with no Origin header used
// to sail straight through with zero check at all. The session cookie's
// SameSite=Lax (see cookies.ts) already blocks the primary CSRF threat --
// a genuine cross-site browser POST won't carry it regardless of anything
// here -- but this function's whole job is checking the request's claimed
// source, and "no Origin" isn't the same as "same-origin." Falls back to
// Referer (which real same-origin browser requests still send) before
// giving up and allowing the request through, narrowing the previous
// unconditional bypass to only genuinely header-less requests (some
// non-browser clients, certain proxies) -- not a live exploit path given
// the SameSite cookie, but this now actually checks what it claims to.
function requestClaimsOrigin(request: Request): string | null {
  const origin = request.get("origin");
  if (origin) return origin;
  const referer = request.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function protectStateChangingApiRequests(request: Request, response: Response, next: NextFunction) {
  if (!request.path.startsWith("/api/trpc") || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next();
  const claimedOrigin = requestClaimsOrigin(request);
  if (!claimedOrigin) return next();
  try {
    const expected = `${request.protocol}://${request.get("host")}`;
    if (new URL(claimedOrigin).origin !== expected) return response.status(403).json({ error: "Cross-site state-changing requests are not allowed." });
  } catch {
    return response.status(403).json({ error: "Invalid request origin." });
  }
  next();
}
