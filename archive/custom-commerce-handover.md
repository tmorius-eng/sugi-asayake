# SUGI ASAYAKE custom-commerce prototype handover

## What is implemented

The project is now full-stack with database, server, and user-authentication capability. The commerce schema includes categories, products, orders, order items, carts, and cart items. The server exposes typed catalog and role-gated administration contracts, while the cart model provides a protected data path for authenticated customers.

The public experience now includes a detailed product page with an image gallery, product information, quantity controls, an Add to Cart action, and delivery/trust information. The cart is presented as a slide-out drawer. The checkout mockup includes customer details, Ulaanbaatar home delivery or branch pickup, and selectable local payment options: QPay, bank transfer, card, and cash on delivery.

The internal `/admin-preview` route demonstrates the design of the back-office experience without requiring credentials. The real `/admin` route is protected and intended for users whose database role is `admin`. Its management workspace includes product inventory, product announcement posts, users and roles, search, and the new-user invitation flow.

## User registration and access

New users authenticate through the built-in OAuth flow and are created with the `user` role. The owner or an administrator promotes selected staff to `admin` through the user-management process. The preview invitation form shows the intended staff workflow; it does not yet send real invitation messages.

| User type | Intended permissions | Current state |
| --- | --- | --- |
| Customer | Sign in, retain a personal cart, place an order | Authentication and persistent cart contract are prepared; order creation UI remains a mockup |
| Staff | Manage catalog items and announcement drafts | Shown in the admin interface; role expansion and mutations are the next implementation step |
| Admin | Manage products, posts, users, and operational settings | Role-gated route and admin interface are prepared |

## What remains before live selling

The current product, checkout, and administration screens are a high-fidelity prototype and include representative merchandise records only. Before launching sales, the next development cycle should connect product CRUD, image upload, inventory changes, cart mutations, and order creation to the existing backend contracts. Payment choices are UI options only; they must be integrated with the selected payment providers before real payment collection. Delivery pricing and pickup branch operating rules also need to be confirmed and encoded.

The recommended production sequence is to onboard the initial catalog, enable image storage, add staff user promotion, persist cart changes, implement order placement, then integrate the approved payment and delivery services. The public product and checkout design can remain while those backend actions are connected incrementally.
