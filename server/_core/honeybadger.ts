// Error tracking (2026-09): ROADMAP.md's TIER 5 items (Sentry, staging, CDN,
// uptime monitoring) were all bundled together as "blocked on choosing a
// production host" -- but error tracking specifically doesn't need one.
// Honeybadger's free tier (5,000 events/mo, no credit card) reports from
// this dev machine today and keeps working unchanged once real hosting
// exists.
//
// Configured only when HONEYBADGER_API_KEY is set (see server/_core/env.ts)
// -- same "N of M, never silently do the insecure/undesired thing without
// real config" discipline as INTEGRATIONS_ENCRYPTION_KEY. Every export below
// is a safe no-op without a key, so nothing else in the app needs to check
// "is error tracking configured?" before using them.
import Honeybadger from "@honeybadger-io/js";
import type { ErrorRequestHandler, Express, RequestHandler } from "express";
import { ENV } from "./env";

const enabled = Boolean(ENV.honeybadgerApiKey);

if (enabled) {
  Honeybadger.configure({
    apiKey: ENV.honeybadgerApiKey,
    environment: ENV.isProduction ? "production" : "development",
    // server/_core/index.ts already installs its own unhandledRejection/
    // uncaughtException handlers (backend audit, 2026-09-02) -- deliberately
    // log-and-continue rather than the crash-the-process behavior Node (and
    // Honeybadger's own automatic handler) defaults to. Disabling
    // Honeybadger's automatic hooks and calling notifyError() from inside
    // those existing handlers instead means both goals are met: the process
    // survives one bad promise, AND the error still reaches Honeybadger.
    enableUncaught: false,
    enableUnhandledRejection: false,
    // Never send credential-shaped fields or raw upload payloads to a
    // third party. `config`/`credentials` cover admin-entered integration
    // secrets (server/db.ts's integration_configs); dataBase64 is a
    // multi-MB image upload with zero diagnostic value in an error report.
    filters: ["password", "apiKey", "config", "credentials", "dataBase64", "token", "secret"],
  });
}

/** Safe to call unconditionally -- a no-op when no API key is configured. */
export function notifyError(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Honeybadger.notify(error instanceof Error ? error : new Error(String(error)), context ? { context } : undefined);
}

/**
 * Express request/error middleware -- catches errors from routes OUTSIDE
 * tRPC (the storage proxy, the QPay webhook, static serving). tRPC's own
 * procedures are reported separately via the onError hook passed to
 * createExpressMiddleware in server/_core/index.ts, since tRPC catches and
 * serializes its own errors before they'd ever reach Express's error
 * middleware chain.
 */
export function registerHoneybadgerMiddleware(app: Express) {
  if (!enabled) return;
  // @honeybadger-io/js resolves its own (Express 5-shaped) copy of
  // @types/express, while this project is on Express 4 -- both middleware
  // functions are plain, runtime-compatible (req, res, next) => void
  // handlers regardless, so this is a real cross-package type-identity
  // mismatch, not an actual runtime incompatibility. TS itself requires the
  // unknown round-trip since the two Request/Response shapes don't overlap
  // enough for a direct assertion.
  app.use(Honeybadger.requestHandler as unknown as RequestHandler);
}

export function registerHoneybadgerErrorMiddleware(app: Express) {
  if (!enabled) return;
  app.use(Honeybadger.errorHandler as unknown as ErrorRequestHandler);
}
