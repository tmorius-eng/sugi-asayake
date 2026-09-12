# SQL injection assessment (2026-09-12)

Tom asked whether the site withstands sqlmap-style attacks. Short answer: **yes,
structurally**. This records how it was checked so the next review need not redo it.

## What sqlmap actually does

sqlmap automates six SQL-injection techniques: **boolean-based blind,
time-based blind, error-based, UNION query, stacked queries, out-of-band**.
Every one needs the same thing first — attacker text that becomes SQL *syntax*
instead of staying *data*. If the text can never break out of its slot, all six
fail at step one.

## Why they cannot break out here

- **Every query is built with drizzle's `sql` template.** Any `${value}` inside
  it is sent as a bound `?` parameter, never concatenated into the statement.
  Bound parameters are injection-proof by construction — the database receives
  the query shape and the values on separate channels. This covers the search
  (`AGAINST(${q})`), all `LIKE` patterns, phone `REGEXP` lookups, and every
  `WHERE`/`SET` expression.
- **The one primitive that concatenates is `sql.raw`.** MySQL will not accept a
  bind parameter for an `INTERVAL n UNIT` count or a `LIMIT n`, so seven places
  need it. Each took a `Math.floor`'d number already; they now all route through
  **`server/_core/sqlSafe.ts` `sqlInt()`**, which throws on anything that is not
  a finite number and emits a bare integer. A string can never reach a raw slot.
  `grep -rn "sql.raw" server/` returns only the helper itself.
- **Input is validated before a query is even built.** Every tRPC procedure has
  a zod schema: numeric ids are `z.number().int().positive()` (a string id is
  rejected outright), and the public search is `z.string().max(120)`.
- **Stacked queries are off at the driver.** mysql2's `multipleStatements`
  defaults to `false` and is never enabled, so `'; DROP TABLE ...` cannot run a
  second statement even in theory.
- **No error-based leakage in production.** tRPC has no custom `errorFormatter`,
  so an unexpected (`INTERNAL_SERVER_ERROR`) message is masked to a generic
  string for the client when `NODE_ENV=production`; raw MySQL error text (which
  error-based injection feeds on) does not reach the browser.
- **Automated scanning is throttled.** `limitApiTraffic` caps `/api/trpc` at
  300 requests / 15 min / IP; a sqlmap run (thousands of requests) hits 429 fast.

## Proof, re-runnable

`server/sqli-probe.integration.test.ts` fires the canonical payloads
(`' OR '1'='1`, `' OR SLEEP(5)`, `UNION SELECT passwordHash`, `'; DROP TABLE
products`, `extractvalue(...)`) at the real public search and asserts: results
stay ordinary arrays, the run stays well under the SLEEP budget (no time-based
blind), and **the products table still exists afterwards** (no stacked DROP).
It also asserts a non-numeric id is rejected at the zod boundary and that
`sqlInt` refuses a non-number.

```powershell
$env:COMMERCE_INTEGRATION_TESTS="1"; pnpm exec vitest run --no-file-parallelism server/sqli-probe.integration.test.ts
```

## The one real hardening left (Tom, on Aiven)

The app connects as **`avnadmin`**, Aiven's superuser. Parameterisation means an
injection cannot happen, but least privilege is the seatbelt: if one ever did,
or a dependency were compromised, a limited account contains the blast. Create a
DML-only user for the app and switch `DATABASE_URL` to it — see
`scripts/aiven-least-privilege.sql`. This changes nothing about behaviour; it
only removes DDL/GRANT rights the app never uses.

Defense-in-depth still open (not blockers): a WAF in front of the host, and
MySQL slow-query logging to surface any `SLEEP()`-style probe.
