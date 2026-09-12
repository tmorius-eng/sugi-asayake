import type { NextFunction, Request, Response } from "express";
import { ENV } from "./env";

/**
 * Terminal access log (2026-09-12) -- the line-per-request view Tom asked
 * for, like nginx's access.log, without adding a dependency. Off unless
 * LOG_REQUESTS=1: the storefront makes ~11 batched tRPC calls per page and
 * the dev server also serves every module, so this is a diagnostic you
 * switch on for a session, not a default.
 *
 *   PowerShell:  $env:LOG_REQUESTS="1"; pnpm dev
 *   Linux/PM2:   LOG_REQUESTS=1 pnpm start
 *
 * Under `pnpm dev` Vite's own module requests are skipped so the log shows
 * pages, API calls and probes rather than hundreds of /src/*.tsx lines.
 */
const DEV_NOISE = /^\/(@vite|@react-refresh|@fs|@id|node_modules|src)\//;

export function logRequests(request: Request, response: Response, next: NextFunction) {
  if (!ENV.logRequests) return next();
  if (DEV_NOISE.test(request.path)) return next();
  const startedAt = process.hrtime.bigint();
  response.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const ip = request.ip || request.socket?.remoteAddress || "-";
    // Same field order as a common access log: time, client, request, status, bytes, duration.
    console.log(`[${new Date().toISOString()}] ${ip} "${request.method} ${request.originalUrl}" ${response.statusCode} ${response.getHeader("content-length") ?? "-"} ${ms.toFixed(1)}ms`);
  });
  next();
}
