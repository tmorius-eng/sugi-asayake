import type { Logger } from "drizzle-orm/logger";

/**
 * Admin overhaul (2026-09-08, Phase K): a SQL query log viewer, without
 * anything DB-side to read from -- Aiven is a managed host, so a
 * non-superuser account can't realistically read a server-side slow-query
 * log there. This stays entirely in-process instead: a small ring buffer
 * implementing Drizzle's own `Logger` interface, wired into the Drizzle
 * client at creation time (server/db.ts). Every query Drizzle issues -- not
 * just slow ones -- passes through `logQuery` below.
 *
 * Deliberately NOT persisted anywhere (matches this codebase's existing
 * accepted tradeoff for its in-memory rate-limit buckets): clears on every
 * process restart, and is per-process, so a multi-instance deploy would
 * only show each instance's own recent queries. Fine for this project's
 * single-process reality.
 *
 * No query-duration column: Drizzle's `logQuery` hook fires the moment a
 * query is *issued*, not when it completes, so a fabricated "duration"
 * would just be wrong. Only what's actually knowable at that point (the SQL
 * text, its bound params, and when it fired) is recorded.
 */

export type SqlQueryLogEntry = {
  id: number;
  query: string;
  params: string[];
  loggedAt: string;
};

const MAX_ENTRIES = 200;
const buffer: SqlQueryLogEntry[] = [];
let nextId = 1;

// Individual bound params can be arbitrarily large (a full HTML post body,
// a base64 image, an encrypted blob) -- this is a diagnostic viewer, not a
// data export, so long values are truncated rather than shown in full.
const MAX_PARAM_LENGTH = 300;

function stringifyParam(value: unknown): string {
  let text: string;
  try {
    // JSON.stringify(undefined) is undefined, not a string -- and this runs
    // inside the driver's logging hook, where a thrown TypeError surfaces
    // as a failed query (2026-09-12 audit: a test that passed `undefined`
    // as a bind parameter died here, not in the driver).
    text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  } catch {
    text = String(value);
  }
  return text.length > MAX_PARAM_LENGTH ? `${text.slice(0, MAX_PARAM_LENGTH)}…` : text;
}

export const sqlQueryLogger: Logger = {
  logQuery(query: string, params: unknown[]) {
    buffer.push({ id: nextId++, query, params: params.map(stringifyParam), loggedAt: new Date().toISOString() });
    if (buffer.length > MAX_ENTRIES) buffer.shift();
  },
};

/** Most recent first -- matches every other admin log tab's ordering. */
export function getRecentSqlQueries(): SqlQueryLogEntry[] {
  return [...buffer].reverse();
}
