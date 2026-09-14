# Supplied audit review — extracted findings

The two supplied external reviews contain the same substantive technical and business audit. They correctly identify the current stack as React, TypeScript, tRPC, Drizzle, MySQL, Express, and Vite, and describe existing safeguards such as schema validation, magic-byte image checks, server-derived order totals, QPay payment re-verification, and hashed expiring staff-invitation tokens.

## Findings to validate and address in this project

| Area | Review finding | Handling approach |
| --- | --- | --- |
| Operations | Admin orders are missing; the post composer is not persisted. | Verify and implement database-backed orders and posts before representing them as live workflows. |
| Platform boundaries | Authentication, storage, notification, and runtime depend on platform-provided infrastructure. | Document honestly. Do not claim the current managed deployment is independently portable; prepare a separate migration plan when the owner chooses their infrastructure. |
| Payments and delivery | QPay requires merchant credentials and callback registration; delivery remains manual without a courier contract. | Retain the credential-safe activation block and document the exact business prerequisites. |
| Security | Security headers, request throttling, explicit CORS posture, audit trail, and bot controls were recommended. | Add suitable same-origin HTTP hardening, narrow rate limits, and an administrative audit record. Treat CAPTCHA as a provider decision. |
| Data integrity | The review recommends foreign keys and deletion rules. | Audit schema and data before introducing additive foreign-key migrations; do not perform destructive changes without a data impact review. |
| SEO and accessibility | Open Graph / social tags, canonical URL, LocalBusiness JSON-LD, robots, sitemap, complete image alternatives, and analytics verification were recommended. | Implement public metadata and discovery files; verify actual image alternatives and static links. |
| Customer experience | Legal pages, order history, storefront filters, transactional email, and low-stock alerts were proposed. | Prioritize legal pages, customer order history, and persisted operational flows. Email needs an enabled transactional provider; low-stock alerts need an agreed threshold and delivery channel. |
| Public routes | `/admin-preview` exposes illustrative admin screens publicly. | Remove or protect the preview route before production release. |

## Important qualification

The review is third-party input, not a binding specification. Its claim that all platform dependencies should be removed requires a separate self-hosted migration project and owner-controlled services; it cannot be safely substituted into the live managed deployment without approved credentials, hosting, and a rollback plan.

## Shoppy.mn public experience reference — August 2026

The public Shoppy.mn homepage demonstrates several useful *patterns* rather than design elements to copy: a prominent product-search entry point; an immediately visible category control; lightweight saved, recently-viewed, and cart utilities; clear account access; dedicated merchandising destinations such as new arrivals, promotions, brands, and gift cards; and a visible payment-method trust area. SUGI ASAYAKE should adapt these principles with its own editorial Japanese-retail visual system, Mongolian product taxonomy, and verified local payment information. It should not reuse Shoppy’s layout, copy, imagery, or branding.

## Confirmed implementation findings — 2026-08-13

| Priority | Confirmed gap | Planned original correction |
| --- | --- | --- |
| Critical | Public “shop” calls-to-action are hard-coded to one product slug; there is no live catalog route, customer search, or category browsing. | Add a SUGI-branded `/shop` route using published catalog data, Mongolian search, category chips, product cards, stock status, and clear empty/loading states. |
| Critical | Checkout does not distinguish ready payment methods from presentation-only methods, and pickup does not capture the selected branch. | Make payment readiness explicit, add branch selection, and structure delivery details more clearly. |
| High | Product stock is not decremented on order creation; cancelled orders do not restore availability. | Add server-owned stock decrement at checkout and idempotent stock restoration when an admin cancels an order. |
| High | The commerce header links to the removed `/admin-preview` route; dashboard items share duplicate `/admin` paths. | Remove the stale public admin link and use unique dashboard navigation identifiers. |
| High | Customers cannot view their own past orders. | Add an authenticated, user-scoped “My orders” route. |
| Medium | The server cart requires sign-in before a customer can start shopping. | Improve sign-in prompts now; treat guest-cart merge as a deliberate later design. |
| Medium | The public catalog returns all published products without filtering or pagination. | Begin with deterministic client-side category and search filtering; add server pagination when catalog scale requires it. |
