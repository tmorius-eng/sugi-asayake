# Forensic audit — 2026-09-12 (scaffold-to-production refinement)

Scope: Tom's 27-phase "FULL-STACK FORENSIC AUDIT + SCAFFOLD-TO-PRODUCTION REFINEMENT" playbook, run in execute-and-fix mode ("do not skip anything", "deep dig, fix everything"). Same classification discipline as [AUDIT-2026-09-09-order-unwind.md](AUDIT-2026-09-09-order-unwind.md): a finding is listed as fixed only when a test fails on the old code and passes on the new, or a browser/server measurement changed.

**Full report (health scores /10 per area, bug register P0–P4, scaffold inventory A–G, AI-slop inventory, what was fixed / intentionally not changed, remaining work, readiness verdict):**
https://claude.ai/code/artifact/97206a4e-517c-411d-bce4-a2f3c30c18e4

**Visual architecture map (how the site operates, function architecture):**
https://claude.ai/code/artifact/fed0a0dd-1d77-4d09-a99b-8e3f6cf0908d

## Verification

Full suite on `3d3b05a` (all integration gates on, real Aiven, `--no-file-parallelism`): **774/774, 83/83 files, 0 regressions, 17.1 min**. `pnpm check`, `pnpm lint`, `pnpm build` and `pnpm audit --prod` clean.

## Verdict

Ready to launch the storefront with cash-on-delivery and store pickup. **Not yet ready to take online payments**: QPay/StorePay/Smart Software code is complete and tested against documented responses but has never run with real credentials, and the eBarimt path is undecided. Before go-live on any host: `DATABASE_CA_CERT`, `NOTIFICATIONS_DISPATCH=1` (one machine), real `OWNER_EMAIL`.

## Commits

| Commit | What |
|---|---|
| `618eeec` | /admin 25-minute idle lock, server-enforced (sliding idle + 8 h absolute in the proof cookie), heartbeat only on real input, cross-tab lock, `face_attempts.idle_locked` (migration 0068) |
| `28774f3` | Storefront content cache 30 s with 21 writer invalidations; session user cache 5 s; invalidation-aware TTL cache. Measured 163→2 ms, 173→2 ms |
| `6653fff` | P0: session cache re-keyed by user id (token key had broken "sign out everywhere"); 390 px overflows in 4 admin sections + /shop pills; admin title/h1; cookie banner out of /admin; login `//` guard; aria-labels; 3 unused dev deps |
| `3d3b05a` | Idempotency keys for checkout and POS (migration 0069); campaign double-send guard (10 min, fingerprint on audit row); payment attempt reuse; QPay callback `SUCCESS` + GET; SSRF guard on vendor URLs; sqlQueryLog crash; `data-retention` job; tests type-checked (`tsconfig.tests.json`, 90 stale fixtures → `testSessionUser()`); ESLint + CI Lint step |

## Health scores (out of 10)

Security 9 · Documentation 9 · Dependencies 9 · Architecture 8 · API 8 · Database 8 · Performance 8 · Edge cases 8 · Testing 8 · Responsive 8 · Frontend code 7 · UX and content 7 · Design system 7 · Accessibility 7 · Product logic 7. Reasons for each are in the report.

## Still open (P3/P4)

Skip link + admin `--a-faint` contrast; coupon per-customer cap race; `a { color: inherit }` outside the cascade layer; variants/analytics screenshot verification on real data; split `db.ts`/`routers.ts` by domain; Aiven region + pool once hosting is chosen. Tom: ntfy token rotation, payment credentials, eBarimt decision, warehouse cutover. Done the same evening: Aiven CA certificate installed on the home laptop and verified (TLSv1.3, bogus CA refused) — the work laptop and the production host need the same file; Tom is handling the 5 junk posts and the 8 brand logos himself.

## Intentionally not changed

React Compiler lint rules (39 false positives on working patterns); the two AdminFaceGate liveness functions (kept for the enforcement decision); Tom's data; the visual direction (needs a one-page approval); no Redis/cluster/CDN before a hosting decision.
