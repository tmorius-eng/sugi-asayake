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

/**
 * Нууц утга агуулж БОЛЗОШГҮЙ хүснэгт/багана (2026-09-23).
 *
 * Bind параметрүүд нь өмнө нь бүтнээрээ (300 тэмдэгт хүртэл) ring buffer-т
 * хадгалагдаж, /admin-ий "SQL лог" таб дээр ба `LOG_SQL=1` үед pm2-ийн
 * лог файлд харагддаг байв: `users.passwordHash`, утасны баталгаажуулалтын
 * код, нууц үг сэргээх/handoff token, царайны загварын шифр. Honeybadger нь
 * `password|token|secret` талбаруудыг аль хэдийн шүүдэг — энд ч ижил
 * хандлага. Утгыг бүхэлд нь маскална (аль параметр аль багана болохыг
 * драйвер хэлдэггүй тул сонгож маскалах боломжгүй).
 */
// `token` дангаараа `guestToken`/`sessionToken`-ыг ч барьдаг тул сагс/зочны
// сешний ердийн query бүхэлдээ нуугддаг байв (2026-09-23) — нууц нь ЗӨВХӨН
// нэвтрэлт/сэргээлт/handoff-ийн токенууд тул тэднийг нэрлэж шалгана.
const SENSITIVE_QUERY_PATTERN = /password|resetToken|tokenHash|secret|`?code`?\s*=|phone_verification_sessions|face_handoff_requests|face_templates|integration_settings/i;

export const sqlQueryLogger: Logger = {
  logQuery(query: string, params: unknown[]) {
    const redact = SENSITIVE_QUERY_PATTERN.test(query);
    const entry = { id: nextId++, query, params: redact ? params.map(() => "[хасагдсан]") : params.map(stringifyParam), loggedAt: new Date().toISOString() };
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) buffer.shift();
    // LOG_SQL=1 (2026-09-12): the same entry, in the terminal, as it fires.
    // The admin SQL tab shows the last 200; this shows all of them live.
    if (process.env.LOG_SQL === "1") console.log(`[sql] ${entry.query}${entry.params.length ? `  -- [${entry.params.join(", ")}]` : ""}`);
  },
};

/** Most recent first -- matches every other admin log tab's ordering. */
export function getRecentSqlQueries(): SqlQueryLogEntry[] {
  return [...buffer].reverse();
}
