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
  if (buckets.size > 10_000) buckets.clear();
  next();
}

// Stricter, per-procedure limit for auth endpoints (login/register/password
// reset). The general `/api/trpc` limit above (300/15min) is far too loose to
// stop credential-stuffing / brute-force attempts against a single endpoint.
const authBuckets = new Map<string, Bucket>();
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 8;

export function checkAuthRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = authBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    authBuckets.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (authBuckets.size > 10_000) authBuckets.clear();
  if (bucket.count > AUTH_MAX_ATTEMPTS) {
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
  const key = clientKey(request);
  const bucket = qpayCallbackBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    qpayCallbackBuckets.set(key, { count: 1, resetAt: now + QPAY_CALLBACK_WINDOW_MS });
    return next();
  }
  bucket.count += 1;
  if (qpayCallbackBuckets.size > 10_000) qpayCallbackBuckets.clear();
  if (bucket.count > QPAY_CALLBACK_MAX_REQUESTS) {
    response.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
    return response.status(429).json({ ok: false, error: "Too many requests. Please try again shortly." });
  }
  next();
}

export function protectStateChangingApiRequests(request: Request, response: Response, next: NextFunction) {
  if (!request.path.startsWith("/api/trpc") || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next();
  const origin = request.get("origin");
  if (!origin) return next();
  try {
    const expected = `${request.protocol}://${request.get("host")}`;
    if (new URL(origin).origin !== expected) return response.status(403).json({ error: "Cross-site state-changing requests are not allowed." });
  } catch {
    return response.status(403).json({ error: "Invalid request origin." });
  }
  next();
}
