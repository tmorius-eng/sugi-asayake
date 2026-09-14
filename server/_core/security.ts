import { randomBytes } from "node:crypto";
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
// Per-response, because script-src carries a NONCE (2026-09-13). The app
// itself ships no inline script, so the nonce exists for one reader:
// Cloudflare. Bot Fight Mode injects an inline bootstrap
// (window.__CF$cv$params + /cdn-cgi/challenge-platform/...) into every HTML
// response at the edge, and the previous static policy blocked it -- one CSP
// error per page view and, worse, the bot check it belongs to never ran.
// Cloudflare copies the nonce it finds in an existing CSP header onto the
// scripts it injects, so a fresh random nonce here is what lets that script
// run without opening script-src to 'unsafe-inline' or a third-party host.
// 'self' keeps working for our own external scripts alongside the nonce.
function contentSecurityPolicy(nonce: string): string {
  return [
  "default-src 'self'",
  // 'wasm-unsafe-eval' (2026-09-13): the admin face gate runs MediaPipe Face
  // Landmarker as WebAssembly (self-hosted under /face-models/mediapipe). It
  // permits compiling wasm only -- eval() and inline script stay blocked.
  // GA4 / Meta Pixel (2026-09-14): loaded by /vendor/analytics-init.js only
  // after cookie consent and only when an id is set in /admin; the hosts
  // are named here so the CSP does not silently block them then.
  `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://www.googletagmanager.com https://connect.facebook.net`,
  // 'unsafe-inline' here covers React/Radix/Tailwind's runtime `style={...}`
  // attributes, which CSP has no practical nonce-based alternative for.
  // Fonts are self-hosted since 2026-09-13; no third-party style/font hosts.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  // Product/site-media images are served from an admin-configured S3/CDN
  // host (S3_PUBLIC_BASE_URL) that varies per deployment, so it can't be
  // pinned to a single origin here.
  "img-src 'self' data: https:",
  "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://*.google-analytics.com https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ].join("; ");
}

export function setSecurityHeaders(_request: Request, response: Response, next: NextFunction) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  // Admin face gate (2026-09-08): `camera=()` is an EMPTY allowlist, meaning
  // no origin at all -- including this one -- may use the camera. It blocks
  // getUserMedia at the document level, before the browser ever prompts, so
  // the failure looks exactly like the user having denied permission
  // ("Permissions policy violation: camera is not allowed in this document"
  // in the console). That is what it did to the /admin face check on its
  // first real run.
  //
  // `camera=(self)` allows only this site's own pages -- every other origin,
  // including anything embedded in an iframe, stays blocked. microphone,
  // geolocation and payment keep their empty allowlists: nothing in this app
  // uses them, and the face gate deliberately captures no audio.
  response.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  if (process.env.NODE_ENV === "production") {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    response.setHeader("Content-Security-Policy", contentSecurityPolicy(randomBytes(16).toString("base64")));
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
