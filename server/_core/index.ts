import "dotenv/config";
// `pnpm dev` used to hard-code `NODE_ENV=development` as an inline shell
// prefix, which native Windows PowerShell (no `cross-env`) fails to parse
// ("'NODE_ENV' is not recognized as an internal or external command"). Rather
// than add a new dependency just for this, default NODE_ENV here — the local
// .env already declares NODE_ENV=development (loaded above), and any real
// deployment sets NODE_ENV=production explicitly before starting the process,
// so this only ever fills in the gap for local `tsx watch` runs.
if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";
import compression from "compression";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { assertProductionSecrets, createContext } from "./context";
import { registerQPayCallbackRoute } from "../qpay";
import { registerStorepayCallbackRoute } from "../storepay";
import { registerVerifyMnCallbackRoute } from "../verifyMn";
import { warmUpModerationModel } from "./moderationModel";
import { warmUpImageSafety } from "./imageSafety";
import { dbPing } from "../db";
import { serveRobots, serveSitemap } from "./sitemap";
import { serveMerchantFeed } from "./merchantFeed";
import { serveProductOgImage } from "./ogImage";
import { finishFacebookLogin, startFacebookLogin } from "./facebookAuth";
import { startScheduler } from "./scheduler";
import { registerAbandonedCartReminderJob, registerDataRetentionJob, registerLowStockDigestJob, registerInventorySyncJob, registerNotificationOutboxPurgeJob, registerStaleTransferJob, registerStockLedgerDriftJob, registerReviewRequestJob } from "../automation";
import { startNotificationDispatcher } from "../notifications";
import { notifyError, registerHoneybadgerErrorMiddleware, registerHoneybadgerMiddleware } from "./honeybadger";
import { limitApiTraffic, protectStateChangingApiRequests, setSecurityHeaders } from "./security";
import { blockScannerProbes } from "./scannerProbes";
import { logRequests } from "./requestLog";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Audit finding BUG-001: refuse to start in production with no real
  // session-signing secret configured, rather than silently falling back to
  // a hardcoded, publicly-committed one (see context.ts's secretKey()).
  assertProductionSecrets();
  const app = express();
  const server = createServer(app);
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(setSecurityHeaders);
  // 2026-09-12: refuse .env / .git / *.php / WordPress-style scanner probes
  // with a bare 404 and ban repeat offenders for an hour, before compression,
  // rate limiting or the SPA fallback spend anything on them. Then, if
  // LOG_REQUESTS=1, an access-log line per request.
  app.use(blockScannerProbes);
  app.use(logRequests);
  // Frontend performance audit (2026-09-02): gzip/brotli-compresses JSON
  // (tRPC responses) and any HTML/CSS/JS this process serves directly --
  // real weight on Mongolia's median 17 Mbps mobile connection, and free
  // regardless of whatever hosting/CDN decision comes later (a CDN in
  // front of this would compress too, but there's no reason to wait for
  // that to exist before compressing responses this server already sends).
  app.use(compression());
  // Error tracking (2026-09): a no-op unless HONEYBADGER_API_KEY is set --
  // see server/_core/honeybadger.ts. Must be this early per Honeybadger's
  // own setup contract (before other app middleware).
  registerHoneybadgerMiddleware(app);
  app.use(limitApiTraffic);
  app.use(protectStateChangingApiRequests);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerQPayCallbackRoute(app);
  registerStorepayCallbackRoute(app);
  registerVerifyMnCallbackRoute(app);
  // Backend audit (2026-09-02): the existing system.health is a tRPC
  // procedure (/api/trpc/system.health), which most external uptime
  // monitors (UptimeRobot etc.) can't probe directly -- they expect a
  // trivial unauthenticated GET at a fixed path. This also checks real DB
  // connectivity via dbPing() (same check the admin dashboard's own "is the
  // DB reachable" indicator uses) rather than only proving the Node process
  // itself is alive, since Aiven connectivity is the thing that actually
  // has documented, real failure modes on this project.
  app.get("/health", async (_req, res) => {
    const db = await dbPing();
    res.status(db.ok ? 200 : 503).json({ ok: db.ok, database: db.ok ? "up" : db.error, time: new Date().toISOString() });
  });
  // Expected, user-facing outcomes (bad input, wrong password, an
  // already-used coupon, ...) -- reporting these to Honeybadger would flood
  // the free tier's 5,000/mo cap with routine validation results, not bugs.
  // Anything else (INTERNAL_SERVER_ERROR, or a thrown non-TRPCError the
  // adapter wrapped) is a real, unexpected failure and gets reported.
  const EXPECTED_TRPC_ERROR_CODES = new Set(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "PRECONDITION_FAILED", "TOO_MANY_REQUESTS"]);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      // Error tracking (2026-09): tRPC serializes its own errors before they
      // ever reach Express's error-middleware chain, so
      // registerHoneybadgerErrorMiddleware below never sees a tRPC
      // procedure's failure -- this hook is the actual integration point.
      onError({ error, path, type }) {
        if (EXPECTED_TRPC_ERROR_CODES.has(error.code)) return;
        notifyError(error, { path, type });
      },
    })
  );
  // 2026-09-09 deep audit: /favicon.ico fell through to the SPA fallback and
  // returned index.html as "text/html" -- browsers that still probe the
  // legacy path (and every tool that does) got a 200 with HTML for an icon.
  // The real icon is the <link rel="icon"> in client/index.html; send them
  // there.
  app.get("/favicon.ico", (_req, res) => res.redirect(302, "/icons/favicon-64.png"));
  // Crawler surface (2026-09-13): sitemap from the catalogue, robots pointing
  // at it -- both dynamic so the origin follows PUBLIC_BASE_URL. Registered
  // ahead of the static/SPA fallback, which used to answer /sitemap.xml with
  // index.html and served a robots.txt naming the retired Manus host.
  // "Continue with Facebook" (2026-09-13): plain OAuth redirect + callback,
  // 404 until FACEBOOK_APP_ID/SECRET are set. See server/_core/facebookAuth.ts.
  app.get("/api/auth/facebook", startFacebookLogin);
  app.get("/api/auth/facebook/callback", (req, res) => { void finishFacebookLogin(req, res); });
  app.get("/sitemap.xml", serveSitemap);
  app.get("/robots.txt", serveRobots);
  // Google Merchant Center scheduled-fetch URL (2026-09-14).
  app.get("/feeds/google-merchant.xml", serveMerchantFeed);
  // The 1200x630 share card for a product (2026-09-14, see ogImage.ts).
  app.get("/og/product/:slug", serveProductOgImage);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  // Catches errors from routes OUTSIDE tRPC (the storage proxy, the QPay
  // webhook) -- must come after all routes, per Honeybadger's own
  // requestHandler/errorHandler ordering contract.
  registerHoneybadgerErrorMiddleware(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Customer-content safety models (2026-09-13): load in the background so
  // the first review / avatar upload does not pay the start-up cost. Both
  // are no-ops when disabled and fail soft (logged) when unavailable.
  warmUpModerationModel();
  warmUpImageSafety();
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // "Controls everything" admin overhaul (2026-09-08, Phases D-F): the one
  // in-process scheduler this app has -- see server/_core/scheduler.ts and
  // server/automation.ts for the two real jobs registered on it.
  registerAbandonedCartReminderJob();
  registerReviewRequestJob();
  registerLowStockDigestJob();
  registerNotificationOutboxPurgeJob();
  registerDataRetentionJob();
  registerStockLedgerDriftJob();
  registerStaleTransferJob();
  registerInventorySyncJob();
  startScheduler();
  // Phone push notifications (2026-09-11) -- only sends on the machine with
  // NOTIFICATIONS_DISPATCH=1; see server/notifications.ts.
  startNotificationDispatcher();
}

// Backend audit (2026-09-02): neither handler existed anywhere -- an
// uncaught async error outside tRPC's own error boundary (tRPC procedures
// already get their errors caught/serialized by @trpc/server) had no
// last-resort handling at all. Log-and-continue rather than exit: a single
// bad promise elsewhere in the process (a fire-and-forget call, a timer
// callback) shouldn't take down the whole server for every other in-flight
// request, and Node's own default behavior for uncaughtException already IS
// to crash the process, so at minimum this guarantees a clear log line
// explaining why, before that happens.
process.on("unhandledRejection", reason => {
  console.error("[process] Unhandled promise rejection:", reason);
  notifyError(reason, { source: "unhandledRejection" });
});
process.on("uncaughtException", error => {
  console.error("[process] Uncaught exception:", error);
  notifyError(error, { source: "uncaughtException" });
});

startServer().catch(console.error);
