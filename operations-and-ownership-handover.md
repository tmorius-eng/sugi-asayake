# SUGI ASAYAKE Mongolia — Operations and Ownership Handover

## What is live in the application

The protected administration workspace now manages catalog items, categories, product image uploads, order fulfilment, staff roles, staff invitations, and published editorial posts. Administrative writes are recorded in the audit-log table. The public preview route has been removed, and customer policy pages are available at `/privacy`, `/terms`, and `/returns`.

The server now adds security headers, rejects cross-site state-changing API requests, and applies a bounded per-instance request-rate control to the application API. These controls reduce common browser abuse but do not replace a managed edge firewall or a full security review.

## Business activation checklist

| Requirement | Owner action before public payment launch |
|---|---|
| QPay | Supply `QPAY_USERNAME`, `QPAY_PASSWORD`, and `QPAY_INVOICE_CODE`; configure the deployed callback URL with QPay; test both success and cancelled payment states. |
| Delivery | Contract a courier or decide to retain store pickup/manual delivery; provide rate, coverage, and dispatch rules before integrating an external delivery API. |
| Staff email | Configure an owned transactional-email sender if invitation messages should be emailed rather than copied from the administrator console. |
| Policies | Have the privacy, terms, and returns wording reviewed and approved by the business before enabling live payment. |
| Operations | Create at least one category and published product, then train staff to confirm payment and update order fulfilment status. |

## Ownership boundary and migration path

The current deployment relies on platform-managed authentication, database, hosting, and object storage services. This is appropriate for the current managed deployment, but the business should retain independent records of product, order, and customer operations.

If independently controlled infrastructure is required later, use a staged migration: export the application source and Drizzle migrations; provision a business-owned database and object storage; replace the current auth adapter with a business-owned OAuth/OIDC provider; configure QPay and email credentials under company ownership; migrate verified data; validate callback, upload, and authorization flows in a staging environment; then switch DNS after a rollback plan is approved. Do not migrate live payment or customer data without a tested backup and cutover plan.

## Discoverability improvements

The application now includes canonical metadata, Open Graph and social metadata, a Mongolian `Store` structured-data block, `robots.txt`, and `sitemap.xml`. The sitemap uses the current production domain; update its URLs if the company connects a custom domain.
