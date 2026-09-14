# Adversarial full-stack audit — 2026-09-09

Scope: Tom pasted an external 12-part audit playbook (break-the-website, contract, zero-trust, concurrency, error handling, waste, database, performance, env, tests, impossible states, AI archaeology). Rather than restate it, this pass ran the playbook against the actual code and reports only what was **verified with evidence**. Prior audits (2026-09-02 backend, 2026-09-06 deep full-stack, 2026-09-08 admin overhaul) had already closed the obvious classes (JWT fallback, dead deps, phone-session TOCTOU, checkout `isPublished`, CSRF, role matrix). This pass therefore went where those did not: **how a paid or credit-funded order is unwound** — cancel → refund → late payment webhook → what analytics, loyalty and bestsellers then believe.

Classification used throughout: **CONFIRMED** (reproduced by a test that fails on the old code and passes on the new), **LIKELY**, **POTENTIAL**, **NOT A PROBLEM**.

> **Second pass, same day ("Fix all of them!! Make it better also! Improve all!!" — Tom):** every item in Inventories 2–4 below that was left for a decision has since been implemented. The tables keep their original wording as the record of *why* each was flagged; the **Status** column in the "Second pass" section at the end says what was done and how it was verified.

---

## Second pass — everything below the confirmed bugs, fixed (2026-09-09, later the same day)

| Item | What was done | Evidence |
|---|---|---|
| **R1** per-customer coupon cap | New nullable `discount_codes.maxUsesPerCustomer` (migration `0056`, applied on Aiven). `validateDiscountCode` counts the redeemer's non-cancelled orders with that code — by account id, or by the last 8 phone digits for guests — at preview (signed-in) and at order time (everyone). Admin form field + list column. `NULL` keeps every existing code's behaviour. | `discount-codes.integration.test.ts` — same shopper refused at preview; same phone as guest refused at checkout; different phone allowed while the global budget has room. Browser: form → server → DB → list ("0 · хэрэглэгч бүрт 1"). |
| **R2** refund-owed visibility | `shared/orders.ts` (`isRefundOwed` / `isRefundable` / `paymentBadgeFor`) is the one definition. Admin Orders: amber pill, a one-click "Буцаан олголт хүлээгдэж буй · N" filter, and the refund form now offered on cancelled-but-paid orders. Dashboard: "Анхаарах зүйлс" banner with the count (`getAdminDashboardSummary.refundOwedCount`). Profile: money-state pill next to the fulfilment pill (refund owed / refunded only). Status email: a cancelled order whose payment was collected tells the customer the money is coming back. | `order-unwind.integration.test.ts` (dashboard count rises on cancel, falls on refund). Browser: all four surfaces checked in DOM + screenshots, 0 console errors. |
| **R3** rate limits per process | `rate_limit_buckets` table (migration `0057`) + `server/_core/persistentRateLimit.ts`: one atomic `INSERT … ON DUPLICATE KEY UPDATE` with `LAST_INSERT_ID(expr)` per attempt, fail-open with logging, expired rows swept. Wired to the **strict** and **phone-verify** tiers only (login/register/reset/checkout/SMS); the high-volume cart/telemetry tiers stay in memory on purpose. | `persistent-rate-limit.integration.test.ts` (limit, isolation per key, window expiry, 12 concurrent attempts → exactly 5 allowed, fail-open on DB outage). `auth.rate-limit.test.ts` still passes through the router. Tests using fixed IPs on strict endpoints now use a per-run subnet so a blocked bucket cannot leak between runs. |
| **R4** unbounded queries | `admin.users` → server-side `{search, page, pageSize}` + `{rows, total}` (GenericListView `serverPagination`); `orders.mine` → cursor-paged `{orders, nextCursor, total}` with an infinite query + "Өмнөх захиалгуудыг үзэх" in Profile; `admin.products` no longer ships `description`/`galleryJson` for ~940 rows — the editor loads one product via new `admin.productDetail`. Wishlist/posts left unpaged (bounded by a user's own toggles / admin-curated). | Integration tests for both pagers. Browser: users pager "1–9 / 9", search "QA Cust" → "1–1 / 1"; profile 20 → 23 unique cards on load-more, refund pill intact on page 2. |
| **R5** order-number collision | 6 random base-36 chars (was 4) + `createOrderFromActiveCart` retries the whole transaction with a fresh number on `ER_DUP_ENTRY … orderNumber` (up to 3). Generator injectable for tests. | Test forces a collision with an existing number → order created under the second number. |
| **R6** QPay amount | `parseQPayPaymentCheck` (pure) reads `paid_amount` / sums PAID rows' `payment_amount`; `decideCallbackOutcome` refuses to confirm an **underpaid** invoice and records it as a failed attempt (visible on the dashboard). Unknown amount → confirm on status, as before. | 6 unit tests on documented QPay shapes. |
| **R7** callback URL from Host | New optional `PUBLIC_BASE_URL` (`ENV.publicBaseUrl`); QPay `callback_url` uses it when set, request Host only as fallback. | Typecheck; documented in env.ts. |
| **Debt #1** duplicated fee rule | `shared/delivery.ts` `computeDeliveryFeeMnt` used by both Checkout.tsx and `createOrderFromActiveCart`. | `delivery-fee.test.ts` (4 cases). |
| **Debt #2** paymentStatus double meaning | Named explicitly: `refundOwedSql` (server) / `isRefundOwed` (shared) derived from the two columns — no new column that could drift. | Same tests as R2. |
| **Debt #3** cached balance vs ledger | `getStoreCreditDrift()` on the admin System Health card ("Дэлгүүрийн зээлийн тэнцэл"), cached 60 s. | Test asserts 0 drifted accounts against the real database — and it caught my own test seed the first time it ran. |
| **Debt #4** PROJECT-GUIDE.md 208 KB | 36 dated sections moved verbatim into HISTORY.md; PROJECT-GUIDE.md is 40 KB with a one-line index of what moved. | `grep "^## "` on both files. |
| **Waste** | `@hookform/resolvers` removed; `84abf….jpg` → `docs/reference/`, `self-review.md` → `docs/`; `.playwright-mcp/` gitignored; new `scripts/db-apply-migration.ts` replaces the per-session throwaway migration scripts. | `pnpm build` clean after removal. |

Full suite after the second pass (`pnpm exec vitest run --no-file-parallelism`, all gates on, real Aiven): **570/570 tests, 62/62 files** (550 before this pass + 20 new, zero regressions). `pnpm check` and `pnpm build` clean. Post-run check for leftover marker rows on Aiven (orders/users/products/categories/payment attempts/ledger/discount codes from every suite and the browser QA): **all zero**. `rate_limit_buckets` holds only test buckets that expire on their own and are swept a day after expiry.

Not done, deliberately: a customer-facing "refund pending" **email template** setting (the line is appended to the existing cancelled-status message); pagination for wishlist / posts (bounded, small); a per-customer cap **race** (two simultaneous checkouts by the same customer on the last allowed use — the global cap stays atomic; per-customer would need a unique key on (code, customer, n)).

---

## 🔴 Inventory 1 — Confirmed bugs (all fixed in this pass)

### BUG-U1 · Store credit spent on an order was never returned on cancel or refund — CONFIRMED, money loss
- **Location**: `server/db.ts` `createOrderFromActiveCart` (debit), `updateAdminOrder` / `cancelOwnOrder` (cancel), `refundOrder` (refund).
- **Trigger**: customer applies 3,000₮ store credit at checkout (balance debited, ledger −3,000 written), then self-cancels from the profile — or an admin cancels, or finance refunds a returned order.
- **Actual**: stock went back on the shelf; the 3,000₮ simply vanished. `refundOrder` additionally capped the cash refund at `orders.totalMnt`, which is the *after-credit* figure, so a 10,000₮ order paid with 3,000₮ credit could be "fully refunded" for 7,000₮ with the customer 3,000₮ short and no ledger trace.
- **Root cause**: no code path anywhere referenced `orders.storeCreditAppliedMnt` after checkout (`grep` proved it: 8 references, all inside checkout/email).
- **Fix**: new `reverseStoreCreditForOrder(tx, orderId, reason)` runs inside both the cancel and refund transactions. Idempotent by construction — the positive ledger row it writes for that `orderId` is the marker — so cancel-then-refund on the same order credits back exactly once. Cash refund cap stays `totalMnt` (cash), credit comes back as credit; the two never overlap.

### BUG-U2 · Order status changes and refunds were read-then-write with no guard — CONFIRMED, double restock
- **Location**: `server/db.ts` `updateAdminOrder`, `refundOrder`.
- **Trigger**: two concurrent cancels of the same order (double-clicked button; customer self-cancel racing a warehouse cancel; `bulkUpdateOrderStatus` retried), or two concurrent refund clicks.
- **Actual**: both requests read "confirmed", both passed the ladder check, both ran `restoreStockForOrder` → stock credited back **twice** for one order. Two concurrent refunds both restocked and both wrote a refund. Reproduced with `Promise.allSettled` in the new test: on the old code both calls fulfilled and stock rose by 2× the order quantity.
- **Root cause**: same TOCTOU shape as the 2026-09-06 BUG-003 phone sessions — the checks were plain reads, unlike checkout's stock/coupon/credit decrements which already used the `WHERE`-guard + `affectedRows` idiom.
- **Fix**: the status flip / refund flip is now a conditional `UPDATE … WHERE status = <validated status>` (resp. `paymentStatus = 'paid'`) executed **first** inside the transaction; the loser blocks on the row lock, sees 0 rows, throws, and rolls back before touching stock or credit.

### BUG-U3 · A paid order that was later cancelled kept counting as revenue, loyalty spend and bestseller volume — CONFIRMED, invariant violation + dead end
- **Location**: every `eq(orders.paymentStatus, "paid")` filter — 8 in `server/db.ts`, 17 in `server/analytics.ts` (incl. two raw `CASE WHEN` expressions).
- **Trigger**: QPay order → webhook marks `paymentStatus = 'paid'` while fulfilment is still pending/confirmed → customer self-cancels (allowed in those states) or warehouse cancels. Cancellation restores stock and, correctly, does not touch `paymentStatus` (the money really was collected).
- **Actual**: the order stayed `paid + cancelled` forever. It was counted in every revenue figure, in `getUserLoyaltyStatus` lifetime spend (a free tier upgrade for a purchase that never shipped — the new test shows 9,007,000₮ counted where 4,000,000₮ was real), in `getBestsellingProducts`, and in conversion. `analytics.ts`'s own header promised "a pending/cancelled order never inflates revenue". Worse, it was **unrefundable**: `refundOrder` required `status = 'returned'`, and `updateAdminOrder` refused to touch a closed order — there was no way to record giving the money back.
- **Fix**: one shared predicate `settledSaleSql = (paymentStatus = 'paid' AND status <> 'cancelled')` exported from `server/db.ts` and used at all 25 sites (the audit playbook's "one canonical source of truth"). `refundOrder` now accepts `returned` **or** `cancelled`, and requires the order to actually be `paid` (refunding an unpaid order was nonsensical and is what makes the conditional UPDATE in BUG-U2 exact).

### BUG-U4 · The QPay webhook could resurrect a cancelled order or move a completed one backward — CONFIRMED, impossible state
- **Location**: `server/db.ts` `markQPayPaymentAttemptPaid`; `server/routers.ts` `payments.qpayCreateInvoice`.
- **Trigger**: (a) customer cancels a pending QPay order (stock restored), then still mints an invoice for it (nothing stopped that) and pays; (b) QPay delivers a callback late or twice (at-least-once delivery) for an order that has since been packed/completed/refunded.
- **Actual**: unconditional `SET paymentStatus='paid', status='confirmed'` — the one writer in the codebase that ignored `updateAdminOrder`'s forward-only ladder. A cancelled order came back to life as "confirmed" with its goods already released (oversell); a completed order dropped back to "confirmed"; a refunded order flipped back to "paid".
- **Fix**: the order row only changes while genuinely awaiting payment (`paymentStatus = 'unpaid' AND status NOT IN ('cancelled','returned')`); `pending` → `confirmed`, any later fulfilment status is preserved. The `payment_attempts` row is always recorded so money arriving for a closed order is visible to finance, and a warning is logged. `qpayCreateInvoice` now refuses closed orders up front.

**Verification**: `server/order-unwind.integration.test.ts` (8 tests, real Aiven, throwaway marker rows, cleaned up in `afterAll`). Against the pre-fix code (source files stashed, test kept): **7 of 8 fail**; with the fixes: **8 of 8 pass**. `pnpm check` and `pnpm build` clean. Full `pnpm exec vitest run --no-file-parallelism`: **550/550 tests, 60/60 files** (542 pre-existing + 8 new, zero regressions). Post-run check of Aiven for leftover marker rows: all zero.

---

## ☠️ Inventory 2 — Failure risks (evidence-backed, NOT fixed — need a decision or are out of scope)

| # | Class | Finding | Evidence | Why not fixed here |
|---|---|---|---|---|
| R1 | Business rule | Discount codes have only a **global** `maxUses`; no per-customer cap. One shopper can reuse a `percent` code on every order until it is exhausted. | `discount_codes` schema has no per-user column; `validateDiscountCode` checks only `usesCount < maxUses`. | Product decision (some stores intend this). Needs Tom. |
| R2 | UX / process | A customer may self-cancel an already-**paid** QPay order. It is now refundable (BUG-U3), but nothing tells the customer a refund is pending and there is no "refund owed" queue in `/admin` — finance has to notice a `cancelled + paid` row in the orders list. | `cancelOwnOrder` checks `status` only (0 references to `paymentStatus`); no client reference to `refundAmountMnt`. | Small UI/process feature; deliberately not invented without Tom's process (bank transfer? store credit?). |
| R3 | Scaling | All rate limits and TTL caches are per-process `Map`s (5 in `security.ts`). On any multi-instance / serverless host the limits do not aggregate. | Known from 2026-09-06 (BUG-006). | Needs shared infra (Redis) — hosting not chosen yet. |
| R4 | Scaling | Unbounded list queries: `getAdminUsers`, `getAdminProducts`, `getOrdersForUser`, `getWishlistForUser`, `getAdminPosts`, `getPublishedPosts` have no `LIMIT`. | `awk` over each function body: 0 `.limit(` calls. | Fine at 937 products / a handful of users; already on the Phase E list (admin Users pagination). |
| R5 | Edge | `orderNumber = "SA" + base36(ms) + 4 random base36 chars`, UNIQUE. A collision inside one millisecond fails that checkout with a raw DB error instead of a retry. | `createOrderFromActiveCart`; schema `.unique()`. | Probability ~1/1.7M per same-ms pair; a retry loop is cheap but not urgent. |
| R6 | Payments | `checkQPayPayment` treats any row with `payment_status` PAID as full payment; it does not compare the paid **amount** to the invoice amount. | `server/qpay.ts`. | QPay not live; verify against QPay's payment-check contract when credentials arrive. |
| R7 | Payments | QPay `callback_url` is built from `req.protocol + Host` header. Behind a misconfigured proxy (or with a spoofed Host) the callback goes elsewhere. Money-safe (the server re-verifies with QPay on every callback; the callback is only a trigger), but the order would not auto-confirm. | `routers.ts` `qpayCreateInvoice`. | Set an explicit `PUBLIC_BASE_URL` when hosting is chosen. |
| R8 | Error handling | 7 `catch {}` blocks in server code swallow errors. The ones traced (email best-effort, corrupt `posesJson`, coupon-preview) are documented and intentional. | `grep -A1 "catch {"`. | Reviewed, no change needed; listed so nobody re-audits them. |

---

## 🧹 Inventory 3 — Technical waste

| Candidate | Evidence | Verdict |
|---|---|---|
| `@hookform/resolvers` runtime dependency | 0 imports anywhere in `client/`, `server/`, `shared/`, `scripts/`; `react-hook-form` itself is used in 1 file. | **SAFE TO DELETE** (`pnpm remove @hookform/resolvers`, then `pnpm build`). Not removed in this pass to keep the diff to the money fixes. |
| `84abf4184403667.6551a930b3b2b.jpg` (176 KB) and `self-review.md` in repo root | Tracked in git; the JPG is the admin-design reference already implemented on 2026-09-08. | **PROBABLY SAFE** to move to `docs/` or delete — Tom's call. |
| `staff_invitations` table, `attachPhoneFromVerifiedSession`, `/manus-storage/*` route | Each is documented in-code as intentionally kept (unused table left rather than migrated; future "re-verify phone" flow; URL safety net). | **KEEP** (documented). |
| `dotenv` flagged by naive import scan | False positive — 11 side-effect `import "dotenv/config"`. | **KEEP**. |
| All other 66 runtime deps | Each imported ≥1 place. | KEEP. |

---

## 🧠 Inventory 4 — Architecture debt (works today, makes future bugs likely)

1. **Delivery-fee / free-shipping formula is implemented twice** — `Checkout.tsx` and `createOrderFromActiveCart`, byte-for-byte identical today, but no shared function in `shared/`. Classic "mathematical folklore" drift risk from the playbook. (Discount previews already go through the server; this one does not.)
2. **`paymentStatus` carries two meanings** — "money collected" *and* "this sale counts". BUG-U3 papers over that with `settledSaleSql`; the honest long-term model is a distinct "refund owed" state (or `refundOwedAt`) set at cancel time, which would also give R2 its admin queue for free.
3. **Store credit has two sources of truth** — the cached `users.storeCreditMnt` and the append-only `store_credit_ledger`, kept in sync only by code discipline (every writer must do both). A periodic reconciliation (`SUM(ledger) == balance`) would catch drift; BUG-U1 was exactly a drift nobody could see.
4. **`docs/PROJECT-GUIDE.md` is 208 KB** and is loaded into every session. It is now mostly history rather than "current status/config/active issues" as its own header says. Moving the dated sections into `HISTORY.md` would cut per-session cost and make the genuinely active warnings visible again.

---

## ✅ Verified NOT A PROBLEM (so the next audit does not redo it)

- **Authorization matrix**: every `admin.*` procedure uses a role-scoped procedure (`adminProcedure` / `financeProcedure` / `marketingProcedure` / `warehouseProcedure` / `staffProcedure` / read-share variants); no `admin.*` mutation is `publicProcedure` or `protectedProcedure`.
- **IDOR**: `orders.cancel`, `payments.qpayCreateInvoice/qpayStatus`, `profile.addresses.update/delete`, `wishlist`, `reviews.create` all scope by `ctx.user.id` in the DB query (`getOrderForUser`, `updateUserAddress(userId, …)`), not by trusting the client id.
- **Client-supplied money fields**: `couponCode`, `applyStoreCreditMnt`, `pickupBranch`, prices and quantities are all re-derived/validated server-side in `createOrderFromActiveCart`; the client total is display-only.
- **Checkout concurrency**: stock, coupon `usesCount`, and store-credit debit all use atomic guarded `UPDATE … WHERE … ; affectedRows === 1` inside one transaction; losing any race rolls back the whole order.
- **Coupon math**: fixed-amount capped at the basis, percent rounded, `minSubtotal` enforced; totals cannot go negative.
- **QPay callback trust**: the callback body is never trusted — the server re-queries QPay (`checkQPayPayment`) before marking anything paid.
- **Face-gate proof cookie**: signed JWT bound to `userId` + `sessionVersion`, httpOnly, cleared on logout; not forgeable client-side.
- **Guest cart token**: 24 random bytes in an httpOnly cookie; a logged-in user's cart is keyed by `userId`, never by a client-supplied id.
- **CSRF**: `SameSite=Lax` session cookie + Origin/Referer check on all state-changing `/api/trpc` requests (BUG-007 fix confirmed present).
- **Env fail-fast**: `assertProductionSecrets()` refuses to start in production without `JWT_SECRET`; `INTEGRATIONS_ENCRYPTION_KEY` / `VERIFY_MN_API_KEY` fail loudly on first use.
- **Storage proxy**: `/cdn/*` is a 302 to `S3_PUBLIC_BASE_URL/<key>` — the key cannot escape the R2 host (scheme+host are fixed) and Express encodes control characters in `Location`.
- **`orderNumber`** has a DB UNIQUE constraint (see R5 for the only residual).

---

## Phased plan (what remains, in priority order)

- **PHASE 0 — stop-ship** (done this pass): BUG-U1, U2, U3, U4.
- **PHASE 1 — correctness**: R6 (verify QPay amount semantics before go-live). R1 needs Tom's decision.
- **PHASE 2 — reliability/process**: R2 ("refund owed" visibility for finance + a customer-facing note), R5 (order-number retry), reconciliation check for store credit (debt #3).
- **PHASE 3 — performance/scale**: R4 pagination (Users first), R3 when hosting is chosen.
- **PHASE 4 — architecture**: shared delivery-fee function (debt #1), `refundOwed` state (debt #2).
- **PHASE 6 — cleanup**: `pnpm remove @hookform/resolvers`; move/delete the two stray root files; trim `docs/PROJECT-GUIDE.md` into `HISTORY.md`.

Each of these is independent; none should be batched with another.
