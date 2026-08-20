# SUGI ASAYAKE commerce and admin roadmap

## Current state

The public website is currently a polished frontend-only brand experience. It can showcase the SUGI ASAYAKE story, product categories, store locations, social destinations, and contact actions. It does not yet securely persist products, inventory, orders, customers, payments, or posts created by staff.

## What a real online shop requires

An online shop needs a product catalog, categories, product media, pricing, stock status, cart, checkout, payment handling, order records, delivery rules, customer notifications, and an authenticated management surface. A staff user should be able to create and edit products, update images and prices, publish announcements, and manage store or fulfillment information without editing code.

## Recommended architecture options

### Option A — Headless Shopify

Use Shopify as the commerce backend and keep this SUGI site as the branded frontend. Shopify provides the commerce admin for products, inventory, orders, discounts, and fulfillment while the site controls the Mongolian-first presentation. This is the quickest path to a reliable shop, but the store connection is an irreversible project setup decision here, so the backing store must be confirmed before enabling it.

### Option B — Custom full-stack admin

Upgrade the project to a full-stack application, then build a protected `/admin` dashboard with role-based access. The backend would use database tables for products, categories, posts, branches, inventory, and orders; object storage for product media; typed API procedures; and a dashboard layout for staff workflows. This is the best path for Mongolia-specific delivery, local payment, custom pricing, or internal operations, but it requires more development and ongoing maintenance.

### Option C — Content-first interim setup

Keep this site as the public brand surface and add a hosted CMS or external checkout links for a lightweight product and promotion catalog. This can launch editorial updates quickly, but it is not a complete inventory-aware store and should be treated as a bridge rather than the final architecture.

## Suggested sequence

First, keep the current category showcase and use it to confirm which product families customers care about. Next, decide whether SUGI wants a connected Shopify store or a custom backend. If the goal is a dependable online catalog and checkout with the least operational overhead, choose Headless Shopify. If the business needs local delivery logic, custom staff workflows, or deeper ownership of data, upgrade to full-stack and build the admin panel.

## Admin panel scope

The first admin release should include authenticated staff access, a dashboard overview, product CRUD, category management, image upload, publish/unpublish status, announcement posts, branch editing, and audit-friendly timestamps. Inventory, orders, discounts, customer accounts, and analytics can follow once the catalog and fulfillment model are confirmed.

## cPanel clarification

“cPanel” is a hosting control panel, not a product-management system. It can help manage a server, but it does not automatically provide a safe product catalog, staff roles, inventory model, or checkout workflow. SUGI should use a purpose-built admin dashboard for business content and commerce, with hosting handled separately by the selected backend or commerce platform.

## Decision needed before commerce setup

Before enabling a real commerce backend, confirm whether SUGI has an existing Shopify store. If there is an existing store, it should be connected through the project’s integrations flow. If there is no existing store, a new development store can be provisioned, but that decision should be made only after confirming that Shopify is the preferred backend.
