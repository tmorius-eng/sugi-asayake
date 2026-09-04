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
import { createContext } from "./context";
import { registerQPayCallbackRoute } from "../qpay";
import { dbPing } from "../db";
import { notifyError, registerHoneybadgerErrorMiddleware, registerHoneybadgerMiddleware } from "./honeybadger";
import { limitApiTraffic, protectStateChangingApiRequests, setSecurityHeaders } from "./security";
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
  const app = express();
  const server = createServer(app);
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(setSecurityHeaders);
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

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
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
