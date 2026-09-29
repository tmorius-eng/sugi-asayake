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

// 2026-09-27: `request.originalUrl` (path + raw query string) was logged
// verbatim -- a QR handoff/face-approve `?token=`, an OAuth `?code=`/`?state=`
// and a `?redirect=` destination all landed in this terminal log (and
// whatever ingests pm2's log file) exactly as sent. Only the query KEYS are
// worth seeing for diagnosis; values that identify a session or grant access
// are replaced with a fixed marker rather than dropped, so the shape of the
// request (which params were present) still shows.
const SENSITIVE_QUERY_KEYS = /^(token|code|state|redirect)$/i;

export function redactedQuery(originalUrl: string): string {
  const queryStart = originalUrl.indexOf("?");
  if (queryStart === -1) return originalUrl;
  const path = originalUrl.slice(0, queryStart);
  const params = new URLSearchParams(originalUrl.slice(queryStart + 1));
  for (const key of params.keys()) if (SENSITIVE_QUERY_KEYS.test(key)) params.set(key, "[хасагдсан]");
  return `${path}?${params.toString()}`;
}

export function logRequests(request: Request, response: Response, next: NextFunction) {
  if (!ENV.logRequests) return next();
  if (DEV_NOISE.test(request.path)) return next();
  const startedAt = process.hrtime.bigint();
  response.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const ip = request.ip || request.socket?.remoteAddress || "-";
    // Same field order as a common access log: time, client, request, status, bytes, duration.
    console.log(`[${new Date().toISOString()}] ${ip} "${request.method} ${redactedQuery(request.originalUrl)}" ${response.statusCode} ${response.getHeader("content-length") ?? "-"} ${ms.toFixed(1)}ms`);
  });
  next();
}
