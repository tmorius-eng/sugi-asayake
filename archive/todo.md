# Vero-inspired redesign checklist

## Header and logo correction

- [x] Create and use a true transparent SUGI ASAYAKE logo asset.
- [x] Make the scrolled header slimmer, cleaner, and visually integrated with the page.
- [x] Verify logo contrast, header spacing, and navigation behavior on desktop and mobile.
- [x] Save a revised checkpoint after validation.

## Logo contrast and image replacement

- [x] Keep the complete SUGI ASAYAKE wordmark white in the scrolled header.
- [x] Replace the unsuitable man-choosing-clothes image with a Japanese everyday-care retail visual.
- [x] Verify contrast and image crop on desktop and mobile.
- [x] Save a revised checkpoint after validation.

## Contrast and image validation notes

The scrolled fixed header now applies a white treatment to the complete transparent wordmark, so ASAYAKE remains readable beside SUGI on the charcoal bar. The stores chapter now points to the generated everyday-care retail asset rather than a clothing/fashion scene; the reserved asset URL will update automatically when generation finishes.

Browser validation confirmed the generated scene is live: a calm Japanese-style care aisle with a shopper selecting a personal-care item, while the store-route text remains readable over the darker overlay.

## Professional redesign

- [x] Audit and reduce competing visual treatments, oversized text effects, and template-like patterns.
- [x] Establish a more restrained premium hierarchy for header, hero, products, stores, and contact.
- [x] Recompose the homepage around clear trust, product, and visit-store actions.
- [x] Implement the redesign responsively with polished interactions and accessible contrast.
- [x] Validate the new visual system on desktop and mobile, then save a revised checkpoint.

## Social and branch navigation

- [x] Review the public Facebook and Instagram pages for relevant company and mobility cues.
- [x] Add official Facebook and Instagram icons that link to the company pages.
- [x] Add branch-specific Google Maps links for Oros Elchingiin, Ikh Nayad Plaza, and Yarmag FOOD CITY.
- [x] Validate all social and map actions on desktop and mobile.
- [x] Save a revised checkpoint after validation.

## Commerce, admin, and category enhancement

- [x] Document the frontend-only limitation and compare Shopify, custom backend, and hosted CMS paths.
- [x] Add a product categories section covering core Japanese drugstore product types.
- [x] Add polished hover/focus states to social icons and Google Maps branch links.
- [x] Validate desktop and mobile interactions and preserve keyboard accessibility.
- [x] Save a revised checkpoint with a clear next-step recommendation for commerce setup.

## Custom commerce prototype

- [x] Upgrade the project to the full-stack template and preserve the existing public site.
- [x] Define product, category, cart, order, and user/admin data concepts for the custom backend.
- [x] Build a detailed product page with image gallery, description, quantity, and Add to Cart action.
- [x] Build a slide-out cart and checkout mockup with Mongolian delivery and payment choices.
- [x] Build an admin dashboard mockup for product CRUD, product posts, and user registration/management.
- [x] Validate storefront and admin flows on desktop and mobile.
- [x] Save a revised custom-commerce checkpoint and document remaining backend integration work.

## Operational commerce integrations

- [x] Inspect current provider configuration and identify required payment, delivery, and email/invitation credentials.
- [x] Connect admin product creation, editing, publishing, and deletion to secure backend mutations.
- [x] Connect catalog image uploads to protected S3 storage and product records.
- [x] Connect staff role promotion and secure invitation creation to the admin user-management flow.
- [x] Defer live payment-gateway and courier activation until the owner selects providers and supplies the required merchant credentials; checkout safely presents the current readiness state.
- [x] Validate administration permissions, product lifecycle, upload, checkout, and error states.
- [x] Save a revised checkpoint and provide provider-configuration handover steps.

## Live commerce implementation detail

- [x] Add protected catalog and category mutation contracts with server-side uniqueness and reference safeguards.
- [x] Add a bounded, admin-only product-image upload contract that stores bytes in S3 and returns stored URLs.
- [x] Replace product management mock data and preview-only actions with live tRPC queries and mutations.
- [x] Add a credential-safe QPay invoice and payment-status contract that remains inactive until merchant setup is supplied.
- [x] Add secure staff invitation records, invitation acceptance, and admin-only user role changes.
- [x] Extend Vitest coverage for critical authorization and data-validation paths.
- [x] Add Vitest coverage for duplicate product/category identifiers and invalid product category references.
- [x] Verify desktop and mobile administration and checkout workflows before the release checkpoint.

## QPay checkout readiness

- [x] Add server-created QPay invoices whose amount is derived from a persisted customer order, not browser input.
- [x] Persist QPay payment attempts and verify callback notifications server-to-server before marking an order paid.
- [x] Provide a visible merchant-setup-pending state that prevents live payment until QPay credentials are configured.
- [x] Connect persistent customer cart actions, checkout totals, and order creation to the authenticated commerce backend.
- [x] Document the merchant-issued QPay credential and callback-registration prerequisite for owner-led live activation.
- [x] Document that a contracted Mongolian delivery provider must be selected before automated dispatch or live rates can be enabled.

## Product detail query regression

- [x] Fix catalog product lookup so unknown or unpublished slugs return `null`, never `undefined`.
- [x] Add a product-detail not-found state that does not surface a query error to customers.
- [x] Add regression tests and validate `/product/hada-labo-gokujyun-lotion` without a published record.

## Audit-driven operational improvements

- [x] Reconcile the supplied audit findings with the current implementation and separate confirmed gaps from managed-platform constraints.
- [x] Add real order-management operations to the protected admin workspace.
- [x] Replace the announcement composer placeholder with a persisted posts workflow or remove the placeholder.
- [x] Add practical server-side security hardening for HTTP headers, request throttling, and sensitive public endpoints.
- [x] Improve discoverability with metadata, social sharing cards, robots, sitemap, canonical URLs, and LocalBusiness structured data.
- [x] Add customer-facing legal and policy pages for privacy, terms, and returns before payment activation.
- [x] Document managed-platform ownership boundaries and a credible migration path for independently controlled authentication and storage.

## Admin product verification

- [x] Verify the admin owner access route and complete a reversible test product create-and-delete cycle.
- [x] Deliver the current admin operating steps and QPay merchant activation checklist.

## Professional commerce audit and improvement

- [x] Audit storefront, admin, cart, checkout, product, order, and data workflows for concrete reliability gaps.
- [x] Review Shoppy.mn interaction and shopping patterns for original, non-copied experience improvements.
- [x] Implement the highest-impact fixes to product discovery, cart/checkout clarity, empty states, and commerce operations.
- [x] Add or extend regression tests for all newly corrected workflows.
- [x] Validate desktop/mobile shopping flows and publish an audited improvement release.

## Professional commerce correction scope

- [x] Replace hard-coded product links with a live category-filtered and searchable `/shop` catalog.
- [x] Add a user-scoped order-history route and navigation entry.
- [x] Capture the selected store for pickup and clearly mark payment methods that are not activated.
- [x] Correct product stock updates on completed checkout and cancelled-order restocking.
- [x] Remove stale public admin-preview navigation and duplicate admin menu keys.

## Commerce audit validation follow-up

- [x] Add regression tests for published catalog discovery, pickup-branch validation, and stock decrement/restock lifecycle.
- [x] Execute isolated database integration coverage for published catalog visibility and checkout-to-cancellation stock restoration.
- [x] Save and publish the completed professional commerce improvement release after full validation.
- [x] Split non-critical storefront and admin route code to reduce the 979 kB initial production JavaScript bundle flagged by the build.
- [x] Re-run production build and visual smoke checks after route code-splitting.
- [x] Smoke-check all lazy-loaded commerce and admin routes after code-splitting on desktop and mobile.
- [x] Smoke-check remaining lazy-loaded customer, admin, policy, and invitation routes after code-splitting on the relevant desktop/mobile viewports.
- [x] Prevent malformed invitation URLs from invoking the protected invitation lookup and logging a client API validation error.
- [x] Re-run final error-log, route, test, and production-build validation before publishing the performance and reliability update.
- [x] Restart and load the affected routes to verify the stale `getOrdersForUser` server-import error is absent from fresh runtime logs.
- [x] Save and publish a clean validated checkpoint containing the lazy-loading and invitation reliability fixes.

## Production blank-screen recovery

- [x] Reproduce and identify the cause of the blank deployed production screen.
- [x] Repair the production rendering failure and validate the deployed homepage, shop, and customer-order routes.
- [x] Publish a recovery checkpoint after confirming clean production behavior.
- [x] Save a post-validation confirmation checkpoint recording that the published deployment was checked live on the homepage, `/shop`, and `/orders` with no browser-console errors.

### Owner-controlled activation prerequisites

The live website is operating with the QPay integration deliberately inactive until the owner adds merchant-issued credentials and registers the callback URL. Automated courier rates and dispatch are also deliberately inactive until SUGI ASAYAKE contracts and selects a Mongolian delivery provider. These are external commercial activation steps, not unresolved code defects.

## Creative storefront redesign

- [x] Audit the current homepage and shopping screens for visual flatness, weak hierarchy, and missed creative opportunities.
- [x] Define and apply a more expressive SUGI ASAYAKE art direction with stronger color composition, editorial layering, and original retail storytelling.
- [x] Create and integrate high-impact branded visual assets that complement the refined direction without inventing customer reviews or product claims.
- [x] Confirm that the commissioned unbranded Sunrise Market hero asset completed successfully and renders in the redesigned homepage.
- [x] Redesign the public homepage and shopping entry points responsively while preserving clear navigation, legibility, and conversion actions.
- [x] Validate desktop and mobile presentation, interactions, TypeScript, tests, and a production build before publishing the creative update.

## Interactive storefront enhancement

- [x] Audit the existing homepage and shop components to define safe, accessible scroll-motion and catalog-control behavior.
- [x] Add reduced-motion-aware scroll reveals and expressive hover states for product cards and interactive shop elements.
- [x] Build a responsive, keyboard-accessible summer campaign carousel on the homepage using real category-level promotional messaging rather than fabricated customer content.
- [x] Implement catalog category filters, in-stock filtering, and clear price/name sorting controls for published daily-care products.
- [x] Validate the new interactions on desktop and mobile and update tests before production release.
- [x] Save and publish the verified interactive storefront enhancement release.
- [x] Smoke-check the deployed homepage and `/shop` route to confirm the carousel, reveal choreography, and catalog controls work in production.

## Catalog Quick View and browsing history

- [x] Inspect the product-card, product-detail, cart, and catalog contracts to reuse existing data and authenticated cart behavior safely.
- [x] Add an accessible Quick View modal from catalog product cards, with product essentials, a detail link, quantity controls, and add-to-cart feedback.
- [x] Persist a minimal, device-local recently viewed product history without collecting customer identity or unnecessary personal data.
- [x] Add a responsive recently viewed products section to the catalog with useful empty and unavailable-product handling.
- [x] Validate the Quick View contract, cart cache update path, local-history behavior, responsive empty-catalog state, unit tests, and production build.
- [x] Render the recently viewed section independently of catalog and filter result branches, with clear empty and unavailable-product messaging.
- [x] Differentiate a first-time browsing history from previously viewed products that are no longer available, with an explicit unavailable-product message.
- [x] Re-validate recent-history empty, zero-filter-result, and unavailable-product scenarios after adding the explicit unavailable state.
- [x] Exercise the catalog’s zero-filter-result state after the history update and confirm recently viewed content remains visible.
- [x] Simulate local saved product IDs that no longer resolve to the catalog and confirm the unavailable-history message on desktop and mobile.
- [x] Document that final live Quick View add-to-cart acceptance must be exercised when the owner publishes the first real catalog product; no fictitious customer-facing product was created for testing.
- [x] Save and publish the verified Quick View and recently viewed catalog release.
- [x] Smoke-check the deployed catalog route; end-to-end Quick View interaction becomes visible when at least one real catalog product is published.

## Admin Content & Media workspace

- [x] Inspect the existing admin workspace, media upload contract, and public page imagery to define safe reusable content slots.
- [x] Add persistent content-slot records and protected admin procedures for reading, updating, and uploading homepage and campaign images.
- [x] Build an Admin Content & Media workspace with clear slot labels, image previews, upload controls, fallback reset, and save feedback.
- [x] Connect live managed media slots to the homepage hero and seasonal campaign while preserving branded fallbacks.
- [x] Add focused authorization tests and validate role access, fallback media behavior, desktop presentation, and a production build before publishing.
- [x] Validate the Admin Content & Media workspace and managed homepage fallbacks on a mobile viewport.
- [x] Exercise the protected site-media upload, persisted public override, and reset workflow end-to-end with a cleaned-up integration test; no fictitious customer-facing image was published.
- [x] Save and publish the verified self-service Content & Media release.
- [x] Smoke-check the deployed homepage and protected Admin navigation after the release is live.

### Current implementation status

The project is now a full-stack application with a MySQL-backed catalog, carts, orders, order items, payment attempts, posts, staff invitations, and audit records. The protected `/admin` route is reserved for users whose database role is `admin`; normal users authenticate through OAuth and are created as `user` until promoted. Catalog CRUD, persistent cart/order mutations, inventory lifecycle safeguards, staff invitations, post publishing, and order fulfilment are implemented. The former public `/admin-preview` route has been removed.

### Commerce architecture history

The following comparison records the original platform decision. The project subsequently adopted the custom full-stack path above; it is not frontend-only.

| Path | Best for | Admin experience | Recommendation for SUGI ASAYAKE |
| --- | --- | --- | --- |
| Headless Shopify | Fastest route to catalog, cart, checkout, payments, fulfillment, and a mature admin | Shopify admin manages products, inventory, orders, discounts, and fulfillment | Recommended when SUGI is ready to sell online; setup must be confirmed because the store connection is irreversible |
| Full-stack custom backend | Maximum control over Mongolia-specific workflows, delivery, pricing, and internal operations | Custom protected admin panel with product CRUD, media, categories, inventory, and posts | Best when the business needs custom operations or local integrations; requires database, auth, storage, API, and maintenance |
| Hosted CMS plus checkout links | Editorial product announcements and lightweight catalog content | CMS manages posts and product stories; checkout remains external | Good interim option, but not a complete online shop or inventory system |

Recommended sequence: keep the current public site as the brand storefront, add product categories now, then choose Headless Shopify for the first real commerce launch unless SUGI already has a preferred store/backend. If a custom admin is required, upgrade the project to full-stack and build a protected `/admin` dashboard using the template’s dashboard layout, role checks, database tables, media storage, and typed procedures. “cPanel” is hosting control software rather than the application itself; the admin panel should be a purpose-built dashboard for products, posts, inventory, orders, and branch content.

## Social reference findings

Facebook source: https://www.facebook.com/AsayakeJapaneseDrugstore/

The public page is titled “Sugi Asayake | Ulaanbaatar” and shows approximately 93K followers, the Mongolian promise “ГЭР БҮЛИЙН ГИШҮҮН БҮРТ ЯПОН ЧАНАР,” official Japanese product positioning, all three UB branch mentions, phone number +976 9450 9911, Storepay mention, email asayake0307@gmail.com, and the related site asayake.mn. The website should use Facebook as a social destination and reinforce the same official, family-care, multi-branch identity.

Instagram source: https://www.instagram.com/asayake_japan_cosmetics/

Instagram requires login in the public browser session, so profile details could not be safely verified. The supplied URL is retained as the official Instagram destination and will be used directly for the site icon and footer social link.

## Review-driven refinements applied

- Major chapters now use visible sunrise fields: pale blue-gray story, warm persimmon selection, pale blue family care, and soft mint location finder.
- Every major section carries a consistent vermilion line, oversized section numeral, and micro-label language.
- Generic product, wellness, and travel photography is replaced with dedicated Japanese everyday-care visual assets, while the existing real store aisle visual remains for locations.
- Official Japanese provenance is repeated through hero trust, proof strip, selection note, family-care points, and footer language.

## Header validation notes

The cleaned asset is tightly cropped with a true alpha background, so the logo no longer appears inside a pale rectangular block. The scrolled header now uses a compact charcoal translucent bar with a thin border and restrained height, maintaining readable white navigation over both light editorial content and photographic chapters.

- [x] Inspect vero.co layout, typography, imagery, spacing, and navigation behavior.
- [x] Record which reference patterns can be adapted without copying Vero branding or content.
- [x] Rework SUGI hero and section composition toward a more spacious editorial rhythm.
- [x] Preserve SUGI logo, Mongolian messaging, red brand color, product proof points, and UB store details.
- [x] Add an editorial navigation and image treatment that feels closer to the reference.
- [x] Validate desktop and mobile presentation, then run the production build.
- [x] Save a revised checkpoint and deliver the updated version.

## Reference notes

Vero.co uses a fixed, minimal white navigation over full-bleed cinematic imagery, a high-contrast mostly-black canvas, very large image-led sections, short copy blocks, centered editorial headlines, pill-shaped outline CTAs, and a simple footer. The page rhythm is a sequence of distinct visual worlds rather than a conventional card grid: dark social imagery, stadium-scale community imagery, then a bold red music section.

For SUGI ASAYAKE, adapt the **full-bleed visual chapters, quiet fixed navigation, short headline-led copy, pill CTA language, and large image transitions**. Keep SUGI’s own warm milk-white / pale blue-gray base, vermilion / marigold / cobalt palette, supplied logo, Mongolian voice, product imagery, and UB store content. Do not copy Vero’s logo, text, black-red color dominance, or social/music content.
