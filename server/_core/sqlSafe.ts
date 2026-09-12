import { sql, type SQL } from "drizzle-orm";

/**
 * The ONE sanctioned way to put a computed number into a query as a raw SQL
 * literal (2026-09-12, SQL-injection review).
 *
 * MySQL will not accept a bind parameter for an `INTERVAL n UNIT` count or a
 * `LIMIT n`, so those few places need `sql.raw`. `sql.raw` is the only
 * drizzle primitive that concatenates instead of parameterising -- the single
 * primitive an injection could ever come through. Every caller already passed
 * `String(Math.floor(x))`; routing them through here turns that convention
 * into an enforced invariant: a value that isn't a finite number (a string
 * that slipped past the types in some future refactor) throws HERE, loudly,
 * instead of reaching the database. The result is always a bare non-negative
 * integer -- never anything an attacker-supplied string could survive as.
 *
 * Everything else in the codebase interpolates through drizzle's `sql`
 * template, which binds values as `?` parameters; those are injection-proof
 * by construction and must NOT use this helper.
 */
export function sqlInt(value: number): SQL {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`sqlInt refused a non-finite value: ${String(value)}`);
  }
  return sql.raw(String(Math.max(0, Math.floor(value))));
}
