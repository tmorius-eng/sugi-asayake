/**
 * The ONE way the test/E2E/script guards read "which schema does this
 * DATABASE_URL point at" (2026-10-01, security audit F2).
 *
 * Three guards each did `url.pathname.replace(/^\//, "")`, which compares the
 * RAW path: `/%64efaultdb`, `/DefaultDB` and `/defaultdb/` all name the
 * production schema to MySQL (percent-decoding by the client, case-insensitive
 * schema names on Windows/lower_case_table_names, a trailing slash ignored) yet
 * slipped past a `Set.has("defaultdb")`. Decode, trim and lower-case first.
 *
 * Throws on anything unparseable -- callers are SAFETY guards, so they must
 * fail CLOSED (refuse), never "can't tell, so allow".
 */
export const PRODUCTION_SCHEMAS: ReadonlySet<string> = new Set(["defaultdb", "mysql", "sys"]);

export function decodedSchemaOf(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "").toLowerCase();
}

export function isProductionSchemaUrl(databaseUrl: string): boolean {
  return PRODUCTION_SCHEMAS.has(decodedSchemaOf(databaseUrl));
}
