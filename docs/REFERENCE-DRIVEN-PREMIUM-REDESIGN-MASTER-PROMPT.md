# SUGI ASAYAKE — REFERENCE-DRIVEN WORLD-CLASS PREMIUM WEBSITE REDESIGN MASTER PROMPT

> Note: This document preserves the complete prompt content available in the supplied attachment. The attachment itself was truncated by the chat export at 50,000 characters during the Quick Stats section; no missing text was invented or silently replaced.

Доорх нь өмнө ярьсан **бүх reference image, бүх geometry, composition, responsive, functionality, safety, testing, Tier 0–6 шаардлагыг нэгтгэсэн бүрэн master prompt**. Үүнийг Claude AI Pro-д шууд хуулж өг. Reference зургуудыг мөн хамтад нь attach хийнэ.

---

# SUGI ASAYAKE — REFERENCE-DRIVEN WORLD-CLASS PREMIUM WEBSITE REDESIGN MASTER PROMPT

## ROLE

You are a senior product designer, UX architect, frontend engineer, accessibility specialist, responsive-design engineer, and ecommerce systems engineer.

You are redesigning the existing **SUGI ASAYAKE** Mongolian ecommerce website.

This is not a request for a generic “modern” or “premium-looking” redesign.

The attached reference images are visual composition blueprints. Reproduce their visual language, spatial rhythm, geometry, proportions, hierarchy, card relationships, asymmetry, editorial feeling, color discipline, and responsive behavior as closely as possible while preserving the existing SUGI ASAYAKE identity, Mongolian content, real ecommerce functionality, and data integrity.

Do not interpret the references loosely.

Do not replace the design with a generic:
- SaaS dashboard
- standard ecommerce template
- ordinary card grid
- generic Tailwind landing page
- centered text-and-button hero
- normal circular progress chart
- basic responsive stack

The final result must feel intentional, editorial, premium, art-directed, calm, tactile, and visually close to the supplied references.

The website must still be a fully working production ecommerce application.

---

# 1. PROJECT CONTEXT

Project:

- Brand: SUGI ASAYAKE
- Business: Interior and skincare ecommerce store in Ulaanbaatar, Mongolia
- Language: Mongolian primary language
- Technology: React, TypeScript, Vite, Wouter, tRPC, Tailwind CSS v4, shadcn/Radix-style components
- Database: MySQL via Drizzle
- Media: Cloudflare R2
- Existing pages:
  - Homepage
  - Shop
  - Product detail
  - Profile
  - Checkout
  - Authentication
  - Admin dashboard
  - Journal/blog or posts
  - Legal pages
- Existing brand colors:
  - Warm paper: `#f8f5ef`
  - Dark ink: `#17181b`
  - Vermilion: `#df1f3d`
  - Gold: `#f0b52d`
  - Pale blue-gray: `#e9f0f2`
- Existing fonts:
  - DM Sans
  - Space Grotesk
  - Noto Sans Mongolian

The design must retain:
- Mongolian text support
- SUGI ASAYAKE brand identity
- warm paper background language
- dark editorial typography
- vermilion brand accent
- gold accent
- clean product presentation
- premium but approachable feeling

---

# 2. CRITICAL RULE: DO NOT BREAK EXISTING FUNCTIONALITY

Before changing visual code, inspect the entire frontend architecture and understand current behavior.

Do not blindly rewrite large components.

The following functionality must remain fully working:

## Storefront

- Homepage routing
- Shop routing
- Product detail routing
- Product breadcrumbs
- Category links
- Search
- Category filtering
- Shop pagination
- URL-backed shop state
- Browser back navigation
- Browser forward navigation
- Page refresh preserving search/category/page state
- Product variants
- Variant-specific price
- Variant-specific stock
- Variant-specific SKU
- Quantity controls
- Add to cart
- Cart updates
- Wishlist
- Recently viewed products
- Quick view
- Product recommendations
- Product reviews
- Product images
- Cloudflare R2 media fallback behavior
- Broken-image fallback behavior

## Checkout

- Guest checkout
- Authenticated checkout
- Address selection
- Address book
- Delivery
- Pickup
- Coupon discounts
- Routine discounts
- Loyalty discounts
- Promotional discounts
- Cash payment
- QPay payment
- Correct payment status
- Order confirmation
- Order totals
- Server-authoritative price calculation
- Server-authoritative stock validation
- Server-authoritative discount validation

## Profile

- Profile overview
- Orders
- Order details
- Preferences
- Wishlist
- Addresses
- Notifications
- Security
- Support
- Loyalty membership
- Profile tabs
- Authentication state
- Logout

## Admin

- Admin authentication
- Role-based permissions
- Admin/staff access control
- Products
- Product creation
- Product editing
- Product deletion
- Product images
- Product variants
- Orders
- Users
- Staff invitations
- Posts
- Homepage media
- R2 upload
- Coupons
- Promotions
- Routine configuration
- Integrations
- Security logs
- Audit logs
- Admin navigation
- Mobile admin navigation
- Admin mutation feedback
- Admin error feedback

Do not change server logic merely to make the visual redesign easier.

Do not move payment logic to the client.

Do not duplicate business logic in the frontend.

Do not hardcode user data.

Do not introduce fake statistics.

Do not remove existing routes.

Do not silently change URL behavior.

---

# 3. WORKING METHOD

Work in controlled phases.

Do not attempt to redesign the entire website in one uncontrolled rewrite.

Before implementation:

1. Read the existing frontend files.
2. Map the route structure.
3. Map shared layout components.
4. Map design tokens.
5. Map data-fetching procedures.
6. Map existing loading and error states.
7. Map current homepage sections.
8. Map current profile loyalty data.
9. Map current product and checkout behavior.
10. Identify components that are behavior-heavy.
11. Identify components that can safely receive visual-only changes.
12. Create a visual baseline before changing anything.
13. Make one tier at a time.
14. Validate after each tier.
15. Do not claim success from TypeScript/build alone.
16. Use authenticated browser testing for authenticated surfaces.

Every phase must preserve working behavior.

---

# 4. REFERENCE IMAGE INTERPRETATION RULE

Treat every supplied screenshot as a precise visual specification.

Analyze and reproduce:

- Page width
- Content max-width
- Outer margins
- Section heights
- Section order
- Column proportions
- Grid geometry
- Card aspect ratios
- Image crop behavior
- Image focal point
- Text block width
- Heading scale
- Heading line breaks
- Letter spacing
- Line height
- Baseline alignment
- Vertical rhythm
- Border radius
- Border weight
- Color relationships
- Surface contrast
- Empty space
- Overlap
- Z-index relationships
- Visual density
- Decorative shapes
- Icon size
- Button dimensions
- Hover behavior
- Mobile rearrangement
- Tablet rearrangement
- Accessibility states

Do not simply copy:
- malformed AI-generated text
- unreadable screenshot text
- placeholder numbers
- fake customer counts
- fake savings values
- fake product claims

Use correct Mongolian HTML text while preserving the same visual geometry.

The visual composition is mandatory even when the copy is adapted.

---

# 5. VISUAL DIRECTION

The website should feel like a combination of:

- premium Mongolian lifestyle brand
- editorial design magazine
- high-end skincare store
- curated interior objects catalog
- boutique gallery
- calm luxury retail experience
- tactile printed publication
- sophisticated but not cold
- artistic but still usable
- expressive but not chaotic

Avoid:

- generic “glassmorphism”
- excessive gradients
- glowing neon
- too many shadows
- overly rounded SaaS cards
- dense admin-style dashboards on the storefront
- childish illustrations
- random decorative blobs
- excessive animation
- weak typography
- huge empty areas with no hierarchy
- cramped mobile layouts
- fake luxury language
- unusable interactions

The design should use strong typography, restrained color, intentional asymmetry, carefully controlled surfaces, and real product imagery.

---

# 6. TIER 0 — BASELINE, DISCOVERY, AND SAFETY

Before visual changes:

## 6.1 Inspect the codebase

Read and understand:

- `client/src/App.tsx`
- `client/src/index.css`
- `client/src/pages/Home.tsx`
- `client/src/pages/Shop.tsx`
- `client/src/pages/ProductDetail.tsx`
- `client/src/pages/Profile.tsx`
- `client/src/pages/Checkout.tsx`
- `client/src/components/CommerceHeader.tsx`
- `client/src/components/DashboardLayout.tsx`
- `client/src/components/AdminWorkspace.tsx`
- `client/src/components/AdminSecurityCenter.tsx`
- `shared/loyalty.ts`
- Relevant server procedures
- Relevant database schema
- Existing tests

## 6.2 Record current behavior

Create a behavior baseline for:

- guest homepage
- authenticated homepage
- shop
- search
- category filtering
- pagination
- product detail
- variants
- cart
- checkout
- profile
- loyalty
- admin login
- admin navigation
- admin product controls
- admin user controls
- admin security controls

## 6.3 Record current visual baseline

Capture screenshots at:

- 1440px
- 1280px
- 1024px
- 768px
- 430px
- 390px
- 375px
- 320px

Capture:

- homepage
- shop
- product detail
- profile
- checkout
- admin login
- admin dashboard

## 6.4 Baseline acceptance

Do not change visual code until you understand:

- which components own routing
- which components own data
- which components own mutations
- which components own authentication
- which components own loyalty calculations
- which elements are shared
- which elements are page-specific

Do not use build success as proof that a control works.

Authenticated UI must be tested with an authenticated browser session.

---

# 7. TIER 1 — SEMANTIC DESIGN SYSTEM

Create or refine semantic design tokens instead of scattering random colors and arbitrary values.

## 7.1 Color tokens

Define semantic tokens for:

- warm paper background
- secondary warm paper
- dark ink
- soft ink
- muted text
- subtle border
- warm border
- pale blue-gray
- vermilion
- gold
- copper
- ivory card
- dark editorial surface
- green editorial accent
- error
- success
- warning
- focus ring

Use the existing SUGI palette as the foundation.

Do not globally turn the entire website into a dark theme.

Dark surfaces should be intentional and section-specific.

## 7.2 Typography tokens

Define consistent levels for:

- display heading
- editorial heading
- page heading
- section heading
- card heading
- body text
- metadata
- eyebrow
- button text
- navigation text
- numeric metric

Support Mongolian glyphs correctly.

Avoid font fallback problems.

Ensure headings do not break awkwardly because of Mongolian text.

## 7.3 Spacing tokens

Create consistent values for:

- page padding
- section padding
- desktop section spacing
- tablet section spacing
- mobile section spacing
- grid gaps
- card padding
- text-to-image gap
- heading-to-body gap
- body-to-CTA gap

## 7.4 Shape and surface tokens

Define:

- editorial radius
- product card radius
- small radius
- border width
- shadow strength
- image overlay
- transition duration

Do not make every element heavily rounded.

Use geometry from the reference images.

---

# 8. TIER 2 — SHARED BRANDED PRIMITIVES

Create reusable visual primitives only where useful.

Potential primitives:

- EditorialEyebrow
- EditorialHeading
- SectionIntro
- BrandedButton
- TextLink
- MediaFrame
- ProductMediaCard
- EditorialCard
- TrustStrip
- Ticker
- NumberedList
- BranchList
- MapPin
- MetricLabel
- MembershipGraph
- TierBadge
- ProgressIndicator
- ResponsiveSection
- EmptyState
- LoadingState
- ErrorState

Do not create abstractions that make behavior harder to understand.

Do not replace existing working business logic with decorative wrappers.

Primitives must support:

- keyboard focus
- loading
- error
- disabled
- mobile
- reduced motion
- correct semantic HTML
- Mongolian text
- long text
- missing images

---

# 9. TIER 3 — SHARED SHELL AND NAVIGATION

The website currently has different shells between homepage, shop, product, profile, checkout, and admin.

Unify the brand language without forcing every page into identical markup.

## 9.1 Public storefront shell

Refine:

- header
- logo area
- navigation
- shop link
- profile link
- wishlist
- cart
- mobile menu
- announcement strip
- footer

Requirements:

- clear active state
- keyboard navigation
- visible focus ring
- accessible mobile menu
- no hidden controls
- no horizontal overflow
- no layout shift
- usable at 320px
- touch targets at least approximately 44px
- preserve existing routes

## 9.2 Admin shell

Do not casually redesign admin navigation.

Important known issue:

Wouter `useLocation()` primarily tracks pathname and may not react reliably to query-only changes such as:

- `/admin?adminSection=users`
- `/admin?adminSection=products`

Do not assume query-only navigation will rerender correctly.

Before modifying admin navigation:

- inspect actual routing behavior
- test authenticated navigation
- verify query changes
- verify pathname changes
- verify browser back
- verify mobile menu
- verify active state
- verify mutation feedback

The following must visibly and functionally work:

- Хэрэглэгч
- Бүтээгдэхүүн
- Аюулгүй байдал
- Захиалга
- Нүүр хуудас
- бусад admin sections

Do not merge a navigation redesign without authenticated browser confirmation.

---

# 10. TIER 4 — HOMEPAGE REFERENCE-DRIVEN REDESIGN

The homepage should become an editorial sequence rather than a conventional collection of equal cards.

The section order should feel intentional and rhythmic:

1. Announcement/ticker
2. Header
3. Hero
4. Trust strip
5. Asymmetric category/product composition
6. Brand story
7. Bestseller/product section
8. Journal section
9. Membership savings / Quick Stats section
10. Store locator
11. Why choose us
12. Footer

Preserve existing data flows and links.

---

# 11. HOMEPAGE HERO

The hero should not be a generic centered banner.

Use:

- strong editorial typography
- asymmetrical composition
- large visual media
- clear product or brand focus
- controlled negative space
- warm paper or dark ink contrast
- a clear but understated CTA
- visual hierarchy based on the reference images

Desktop:

- use an asymmetric split or layered composition
- text may occupy approximately 35–45%
- visual media may occupy approximately 55–65%
- avoid equal columns if the reference does not use them
- preserve strong horizontal rhythm
- maintain clear focal point

Mobile:

- stack intentionally
- do not simply shrink desktop
- ensure heading remains dominant
- keep image crop intentional
- place CTA where it is reachable
- prevent text from covering important product detail
- no horizontal scroll

---

# 12. ASYMMETRIC PRODUCT / CATEGORY MASONRY SECTION

Reference visual:

- editorial masonry composition
- asymmetric blocks
- different card sizes
- large image-led tiles
- smaller supporting tiles
- varied aspect ratios
- carefully controlled gaps
- no repetitive equal-card grid
- visual rhythm created by scale difference

## Desktop geometry

Use a wide content frame approximately 1200–1320px.

Possible structure:

- one large feature tile occupying approximately 45–55% width
- two stacked or offset supporting tiles occupying the remaining area
- one or more smaller supporting tiles
- intentional vertical alignment
- different card heights
- image-led composition
- text overlay or adjacent text depending on reference

Do not use a standard four-column ecommerce product grid here.

Each tile must have:

- semantic link
- image
- image fallback
- accessible label
- hover treatment
- correct route
- keyboard focus
- correct category/product destination

## Image treatment

- preserve product focal point
- use `object-fit` intentionally
- do not crop faces or product labels
- use overlays only when needed for contrast
- avoid excessive dark overlays
- support missing images
- preserve R2 fallback behavior

## Mobile

At 768px and below:

- rearrange into a readable vertical sequence
- preserve size hierarchy
- keep one feature tile visibly dominant
- do not make every tile identical
- do not create excessive scrolling
- keep text readable
- ensure touch interactions work

---

# 13. DARK JOURNAL SECTION

Reference visual:

- dark canvas
- large “Journal” or editorial heading
- staggered card arrangement
- light ivory cards
- dark cards
- muted green accent cards
- editorial storytelling
- cards not all equal
- strong contrast against surrounding warm sections

## Desktop layout

Use:

- dark background approximately `#17181b`
- large heading with high contrast
- multiple cards of varied size
- staggered vertical positioning
- controlled grid
- intentional whitespace
- one or more feature cards
- smaller supporting cards

Suggested visual roles:

- ivory editorial card
- dark inset card
- muted green card
- image-led card
- text-led card
- date/category metadata
- arrow or text link

Do not turn it into a standard blog list.

Do not use random colors.

Use the reference rhythm:

- one dominant feature
- supporting cards offset around it
- editorial asymmetry
- quiet but high-end appearance

## Typography

- oversized editorial heading
- compact uppercase eyebrow
- readable Mongolian body text
- careful line breaks
- no text embedded into images
- no malformed generated text

## Mobile

- dark canvas remains
- heading remains visually strong
- cards stack in a controlled editorial order
- feature card remains dominant
- no sideways scroll
- card content remains readable
- buttons and links remain touch-friendly

---

# 14. STORE LOCATOR SECTION — “ТАНД ОЙРХОН”

Reference visual:

- warm or light background
- left editorial heading
- central map or map-like visual
- gold location pins
- right numbered branch list
- large empty space
- precise three-zone composition

## Desktop geometry

- left column: approximately 25–30%
- middle map: approximately 40–50%
- right branch list: approximately 25–30%
- large horizontal frame
- aligned top or center baseline
- map must not become a generic embedded-map rectangle
- preserve editorial map treatment

Left block:

- eyebrow
- large two-line or three-line Mongolian heading
- short description
- optional text link

Middle:

- map visual or existing map component
- pale background
- simplified streets/shapes
- gold pins
- pin labels where appropriate
- map controls only if they are functional
- no fake interaction controls

Right:

- numbered list:
  - 01
  - 02
  - 03
- branch name
- district/location
- address
- opening hours if real data exists
- telephone/link if real data exists
- active/hover state
- click should focus or navigate to the correct branch/map location if supported

Do not invent branch details.

## Mobile

Order:

1. heading
2. description
3. map
4. branch list

or:

1. heading
2. branch list
3. map

Choose the order that best matches the reference and usability.

Requirements:

- no map overflow
- pins remain visible
- list is readable
- branch rows are touch-friendly
- no tiny text
- no horizontal scrolling

---

# 15. WHY CHOOSE US SECTION

Reference visual:

- dark canvas
- oversized heading
- supporting copy
- three horizontal ivory benefit cards
- strong contrast
- spacious composition
- minimal decoration
- premium editorial tone

## Desktop

Dark section:

- background: dark ink
- large white/ivory heading
- supporting text below or beside heading
- three horizontal ivory cards
- cards have subtle borders or restrained shadows
- cards are not overly rounded
- each card includes:
  - number or small icon
  - heading
  - concise description
  - optional arrow/link

Possible real benefits:

- Баталгаатай бүтээгдэхүүн
- Хүргэлттэй
- Гишүүнчлэлийн хөнгөлөлт
- Салбарын сонголт
- Хурдан захиалга
- Арчилгаа, интерьерийн curated сонголт

Only use claims supported by the actual business.

## Geometry

- heading should be dominant
- cards should align horizontally
- card heights should be consistent
- use generous gaps
- preserve visual asymmetry if shown in reference
- avoid generic centered feature cards

## Mobile

- heading remains oversized but fits
- benefit cards stack
- each card remains horizontal or editorially compact
- no excessive vertical gaps
- text remains readable
- section does not become a basic accordion unless required

---

# 16. QUICK STATS REPLACEMENT — MEMBERSHIP SAVINGS SECTION

Replace the existing Quick Stats area with a premium SUGI ASAYAKE loyalty/membership savings section.

This must not be a generic statistic section.

Do not create two ordinary donut charts.

Do not show fake numbers.

Do not use placeholder metrics.

The purpose is to show:

- customer membership status
- current loyalty tier
- current discount percentage
- money saved through loyalty discounts
- progress toward the next tier
- clear explanation of how membership creates more savings

---

## 16.1 Real loyalty tiers

The existing shared source of truth is:

`shared/loyalty.ts`

Use the existing definitions:

- Стандарт: 0% discount, minimum lifetime spend ₮0
- Хүрэл: 3% discount, minimum lifetime spend ₮500,000
- Мөнгөн: 5% discount, minimum lifetime spend ₮1,000,000
- Алтан: 10% discount, minimum lifetime spend ₮10,000,000

Do not duplicate or redefine these values in the frontend.

Import the shared loyalty definitions.

---

## 16.2 Data rules

Authenticated customer:

- show the real eligible lifetime spend
- show the real current tier
- show the real discount percentage
- show real accumulated loyalty savings if available
- show next tier
- show exact amount remaining
- show progress toward next tier
- show loading state while loading
- show honest unavailable state if a metric is unavailable

Guest visitor:

- never show another customer’s private data
- show public membership explanation
- show the real tier table
- use wording such as:
  - “3% хүртэл”
  - “5% хүртэл”
  - “10% хүртэл”
- show login/profile CTA
- do not pretend the guest personally saved money

If accumulated savings is not currently available:

- add a read-only server query only if necessary
- calculate only from authoritative order/discount data
- do not use client cart state
- do not count cancelled orders unless business rules explicitly include them
- do not count returned orders unless business rules explicitly include them
- do not include coupon/promotion/routine discount as loyalty savings
- never silently display ₮0
- display:
  - “Хэмнэсэн дүнг тооцоолж байна”
  - or an honest unavailable state

---

## 16.3 Metric distinction

The following three values must remain visually and mathematically separate:

### A. Loyalty discount rate

Examples:

- 0%
- 3%
- 5%
- 10%

Meaning:

- discount applied based on current membership tier

### B. Total loyalty savings

Example:

- ₮45,000

Meaning:

- real amount saved through loyalty discounts

### C. Membership progress

Example:

- 62%

Meaning:

- progress toward the next tier

Never display:

- “82% saved” when it means progress
- ₮0 when data is unavailable
- fake customer count
- fake savings amount
- a percentage without a clear label

---

## 16.4 Outer section geometry

The reference uses:

- wide warm ivory section
- calm editorial composition
- left text block
- right central infinity graph
- generous empty space
- no heavy enclosing card
- no generic dashboard panel

Colors:

- background: `#fffdf9` or `#f8f5ef`
- primary ink: `#17181b`
- muted text: `#77787d`
- border: `#ded9d0`
- copper/rose graph: muted terracotta
- charcoal graph: dark gray
- gold accent: `#f0b52d`
- vermilion CTA: `#df1f3d`

Desktop:

- max-width approximately 1200–1320px
- horizontal padding approximately 48–72px
- left column approximately 28–34%
- right graph approximately 60–68%
- gap approximately 70–120px
- vertically centered

Do not make the entire page dark.

---

## 16.5 Left editorial block

This is not a normal card.

Use:

- small eyebrow:
  - “ГИШҮҮНЧЛЭЛ”
  - or “MEMBERSHIP”
- large editorial heading:
  - “Quick Stats”
  - or:
    “Гишүүнчлэлийн
     хэмнэлт”
  - or:
    “Илүү их
     худалдан авалт,
     илүү их хэмнэлт.”
- intentional line breaks
- left alignment
- large display typography
- tight line height
- dark ink
- approximately 52–78px desktop

If using “Quick Stats”:

- include Mongolian explanatory heading
- English must not be the only meaning

Description:

- width approximately 250–340px
- 13–15px
- muted gray
- line-height approximately 1.55–1.7

Suggested copy:

“Таны нийт худалдан авалтын дүн өсөх тусам гишүүнчлэлийн түвшин ахиж,
дараагийн захиалга бүр дээр илүү их хэмнэлт үүснэ.”

Authenticated metadata:

- current tier
- current discount
- eligible lifetime spend
- next tier
- amount remaining

Guest metadata:

- “Нэвтэрснээр өөрийн хэмнэлтийг хараарай”

CTA:

- editorial text link, not oversized button
- examples:
  - “Гишүүнчлэлийн нөхцөл харах →”
  - “Профайл руу орох →”
- real route
- keyboard accessible
- visible focus

---

## 16.6 Infinity graph geometry

The main graphic must resemble the reference’s connected infinity / figure-eight shape.

It must not look like two unrelated donut charts.

Desktop:

- graph width approximately 540–680px
- height approximately 230–330px
- centered vertically
- no enclosing card border
- generous whitespace

Shape:

- continuous figure-eight path
- left loop and right loop overlap at the center
- left loop: muted copper/rose
- right loop: charcoal gray or muted gold
- pale gray-beige background track
- active progress shown with colored path
- line thickness approximately 14–22px
- rounded line ends
- no neon
- no 3D effect
- no glossy effect
- no excessive gradient

SVG is preferred.

CSS circles are acceptable only if the actual infinity overlap is visually correct.

Every graph value must also be visible as real text.

---

## 16.7 Infinity graph semantics

### Left loop

Represents:

- membership progress
- eligible lifetime spend
- progress toward the next tier

Authenticated center value:

- actual eligible lifetime spend, for example:
  - “₮1.2M”

Label:

- “Таны нийт худалдан авалт”
- or:
  “Дараагийн түвшинд хүрэх явц”

Do not confuse this with total money saved.

### Right loop

Represents:

- current loyalty discount percentage

Authenticated center value:

- 0%
- 3%
- 5%
- 10%

Label:

- “Одоогийн хөнгөлөлт”

Near or below graph:

- “Хэмнэсэн дүн: ₮X”
- only when real data exists

### Center crossing

The overlap communicates:

`spend → tier → discount → savings`

Optional:

- tiny gold dot
- subtle connector
- restrained highlight

Do not place unreadable text over the crossing.

---

## 16.8 Tier progress

Under or beside the graph:

Current tier:

- Стандарт
- Хүрэл
- Мөнгөн
- Алтан

Show:

- current tier name
- current discount
- lifetime eligible spend

Next tier:

- show only if a next tier exists
- show exact amount remaining:
  - “Дараагийн түвшин: Мөнгөн — ₮350,000 дутуу”

Progress:

```text
(eligibleSpend - currentTier.minSpend) /
(nextTier.minSpend - currentTier.minSpend) * 100
```

Clamp between 0 and 100.

Do not show next-tier progress after Алтан.

For Алтан:

“Та хамгийн дээд түвшинд хүрсэн байна.”

Do not confuse:

- “Явц: 62%”
- “Хөнгөлөлт: 5%”

These must be separately labeled.

---

## 16.9 Quick Stats responsive behavior

### 1440px / 1280px

- two-column layout
- editorial block left
- infinity graph right
- graph remains large
- metrics remain readable
- heading remains dominant

### 1024px

- two-column layout if readable
- reduce graph width
- reduce heading to approximately 52–64px
- prevent text/graph collision
- preserve both loop values

### 820px

- controlled two-row layout:
  1. editorial heading and description
  2. centered graph
- tier metadata below graph
- do not make graph tiny

### 768px

Stack:

1. eyebrow
2. heading
3. description
4. infinity graph
5. current tier
6. savings
7. next tier
8. CTA

### 430px / 390px / 375px

- horizontal padding 20–24px
- heading 40–52px
- graph width 100%
- graph height 190–240px
- line thickness 10–14px
- values readable
- labels below loops if necessary
- no horizontal scroll
- no overlapping text
- no tiny percentage

### 320px

- preserve infinity silhouette
- reduce dimensions carefully
- move labels below loops
- stack metadata
- no SVG clipping
- no overflow
- no hidden value

---

# 17. IMAGE AND CONTENT RULES

Use real product and brand media from Cloudflare R2.

Do not:

- embed important text inside images
- use fake product images
- use unrelated stock imagery without approval
- remove R2 fallback behavior
- make content dependent on one laptop’s local filesystem
- hardcode image URLs that bypass the existing media system

If image is missing:

- show intentional fallback
- preserve card geometry
- do not collapse layout
- do not show a broken browser image icon

For generated or reference-derived visual text:

- use correct HTML text
- preserve visual line lengths
- preserve approximate line breaks
- do not copy malformed screenshot text

---

# 18. RESPONSIVE DESIGN REQUIREMENTS FOR THE ENTIRE WEBSITE

Test all major pages at:

- 1440px
- 1280px
- 1024px
- 820px
- 768px
- 430px
- 390px
- 375px
- 320px

Check:

- no horizontal scrolling
- no clipped text
- no overlapping controls
- no content hidden behind header
- no inaccessible mobile menu
- no buttons outside viewport
- no broken grids
- no tiny text
- no unusable forms
- no broken product cards
- no broken checkout fields
- no broken profile tabs
- no broken admin tables
- no broken dialogs
- no overflow from long Mongolian text
- no layout shift caused by missing images
- no keyboard traps
- no inaccessible focus states

Touch targets should be approximately 44px or larger.

---

# 19. PROFILE PAGE DESIGN

Preserve all existing Profile functionality.

Visually adapt Profile to the new premium brand language:

- warm paper page
- dark editorial heading
- clear tab hierarchy
- spacious cards
- loyalty card integrated with membership visual language
- consistent typography
- responsive layout
- clear loading and error states

Do not remove:

- orders
- wishlist
- addresses
- notifications
- preferences
- security
- support
- loyalty information

The Profile loyalty card should use the same tier definitions as the homepage membership section.

Do not duplicate tier logic.

---

# 20. SHOP PAGE DESIGN

Preserve:

- search
- category
- pagination
- URL state
- back navigation
- refresh state
- product links
- variants
- quick view
- wishlist
- recently viewed
- recommendations

Visual redesign may include:

- editorial page header
- better product card proportions
- refined filters
- stronger product image presentation
- premium pagination
- clearer empty states
- improved mobile filter controls

Do not change query semantics.

Do not make search/category/page state local-only.

Do not remove pagination.

Do not cause product navigation to lose current shop context.

---

# 21. PRODUCT DETAIL DESIGN

Preserve:

- breadcrumbs
- category route
- product gallery
- variant selection
- quantity
- stock
- SKU
- price
- add to cart
- reviews
- cross-sell
- wishlist
- loading
- error state

Visual direction:

- editorial product gallery
- large image area
- restrained information panel
- premium typography
- strong price hierarchy
- clear variant selection
- accessible quantity controls
- responsive purchase area

Do not hide stock or price.

Do not allow stale client price.

Do not break variant selection.

---

# 22. CHECKOUT DESIGN

Do not redesign checkout in a way that affects behavior.

Preserve:

- guest checkout
- authenticated checkout
- delivery/pickup
- address book
- coupon
- routine discount
- loyalty discount
- cash
- QPay
- order confirmation

Visual improvements may include:

- clearer step hierarchy
- stronger form grouping
- responsive layout
- better validation messages
- premium summary panel
- mobile-friendly order summary
- accessible error messages

Do not change payment semantics.

Do not change discount formulas.

Do not make checkout dependent on frontend-only calculations.

---

# 23. ADMIN DESIGN AND FUNCTIONAL SAFETY

Admin visual redesign must be done only after authenticated browser verification.

Known historical problem:

Some outer admin buttons changed only the query string while Wouter observed the pathname. This caused buttons such as:

- Хэрэглэгч
- Бүтээгдэхүүн
- Аюулгүй байдал

to appear clickable but not change visible content.

Therefore:

- inspect actual router behavior
- test query-only navigation
- test pathname navigation
- test active state
- test browser back
- test mobile menu
- test all admin sections
- test authenticated session
- test role permissions

Do not rely on build/type-check.

Security logs:

- must not be one endless unpaginated list
- must support pagination or a deliberate bounded view
- must have page 1/page 2 behavior if pagination is implemented
- must show loading/error/empty states
- must not silently truncate security information
- must not expose sensitive secrets
- must remain usable on mobile

Staff invitation:

- must be responsive
- forms must fit mobile width
- fields must not overflow
- validation must be visible
- success/error states must be clear
- invitation mutation must remain functional

---

# 24. ACCESSIBILITY

Every redesigned section must support:

- semantic HTML
- heading hierarchy
- keyboard navigation
- visible focus ring
- screen reader labels
- sufficient contrast
- touch targets
- reduced motion
- error announcements
- loading announcements where appropriate
- no color-only meaning
- no inaccessible SVG
- no text inside images for essential content

For the membership graph, screen readers must receive:

- current tier
- current discount
- eligible lifetime spend
- total loyalty savings
- next tier
- progress toward next tier

The graph must not rely on color alone.

---

# 25. ANIMATION AND INTERACTION

Use animation sparingly.

Allowed:

- subtle hover
- restrained image zoom
- gentle opacity transitions
- small graph progress reveal
- subtle card translation
- soft ticker movement if accessible

Avoid:

- excessive parallax
- distracting looping animation
- fast motion
- content that moves unexpectedly
- motion that blocks interaction
- animation that hides data
- animation that causes layout shift

Respect:

```css
@media (prefers-reduced-motion: reduce)
```

When reduced motion is enabled:

- disable non-essential animation
- preserve all content
- preserve graph geometry
- preserve interaction

---

# 26. PERFORMANCE

Do not sacrifice performance for visual effects.

Requirements:

- avoid unnecessary re-renders
- avoid loading all large images immediately
- use appropriate image sizes
- lazy-load below-the-fold images where safe
- preserve existing data fetching
- avoid duplicate network calls
- avoid giant new dependencies unless necessary
- do not replace simple SVG with a heavy chart library
- preserve page responsiveness
- do not block checkout
- do not block admin actions

---

# 27. TESTING REQUIREMENTS

Do not claim completion from a successful build alone.

Run:

```powershell
pnpm check
pnpm build
```

Run existing targeted tests.

Use the project’s correct Vitest command and preserve the project’s no-file-parallelism requirement where applicable:

```powershell
pnpm exec vitest run --no-file-parallelism
```

Test:

## Homepage

- guest state
- authenticated state
- missing media
- loading state
- error state
- section links
- ticker
- category masonry
- journal cards
- store locator
- why choose us
- membership section

## Membership

- guest
- Standard customer
- Bronze / Хүрэл customer
- Silver / Мөнгөн customer
- Gold / Алтан customer
- exactly ₮500,000
- exactly ₮1,000,000
- exactly ₮10,000,000
- just below each threshold
- just above each threshold
- unavailable savings data
- no next tier
- returned order handling
- cancelled order handling
- coupon discount excluded from loyalty savings
- promotion discount excluded from loyalty savings
- routine discount excluded from loyalty savings
- percentage and savings shown separately
- no fake zero fallback

## Shop

- search
- category
- pagination
- page refresh
- browser back
- browser forward
- product navigation preserves context
- empty result
- slow loading
- mobile filters

## Product

- variant selection
- price update
- stock update
- SKU update
- add to cart
- quantity
- breadcrumbs
- category link
- wishlist
- reviews

## Checkout

- guest checkout
- authenticated checkout
- delivery
- pickup
- coupon
- loyalty discount
- cash
- QPay
- validation
- order confirmation

## Profile

- tabs
- orders
- wishlist
- address
- notification
- security
- loyalty
- logout

## Admin

- authenticated login
- users button
- products button
- security button
- orders button
- homepage button
- browser back
- browser refresh
- mobile sidebar
- staff invitation
- audit log pagination
- permission restrictions
- mutation feedback

## Responsive screenshots

Capture and inspect:

- 1440px
- 1280px
- 1024px
- 820px
- 768px
- 430px
- 390px
- 375px
- 320px

## Accessibility

- keyboard-only navigation
- focus order
- focus visibility
- screen reader labels
- reduced motion
- graph semantic text
- form labels
- dialog behavior
- mobile menu behavior

---

# 28. ACCEPTANCE CRITERIA — REJECT THE IMPLEMENTATION IF

Reject the implementation if:

- it looks like a generic ecommerce template
- the reference geometry is ignored
- the design is only “premium” by using darker colors
- all sections become identical card grids
- the asymmetric masonry composition is missing
- the Journal section is a normal blog list
- the store locator is a generic map rectangle
- the Why Choose Us section is a standard three-column icon grid
- Quick Stats is replaced with two ordinary donut charts
- the infinity/figure-eight graph is missing
- the left editorial block disappears
- current discount and total savings are confused
- progress percentage and discount percentage are confused
- fake numbers are shown
- private customer data is shown to guests
- savings silently displays ₮0 when unavailable
- loyalty tiers differ from `shared/loyalty.ts`
- checkout behavior changes
- payment behavior changes
- server-authoritative discounts are bypassed
- product variant behavior changes
- shop URL state breaks
- browser back breaks
- profile tabs break
- admin buttons appear clickable but do nothing
- admin query-only navigation is assumed to work without testing
- security logs remain an endless unpaginated scroll
- staff invitation remains non-responsive
- mobile layouts overflow
- SVG graph clips
- text overlaps
- essential text is embedded in images
- build success is treated as UI verification
- no authenticated browser testing is performed

---

# 29. REQUIRED DELIVERY FORMAT

Work tier by tier.

After every tier, report:

1. Files changed
2. Components changed
3. Behavior preserved
4. New behavior added
5. Tests run
6. Screenshots checked
7. Known limitations
8. Any data/backend requirement
9. Any decision that requires approval

Do not proceed to the next tier if the current tier breaks existing behavior.

At the end, provide:

- final changed-file list
- final behavior checklist
- final responsive screenshot checklist
- final accessibility checklist
- final test output
- known limitations
- backend/data requirements
- recommended next steps

Do not say “complete” unless:

- `pnpm check` passes
- `pnpm build` passes
- relevant tests pass
- authenticated browser testing passes
- responsive screenshots are visually inspected
- existing ecommerce behavior is confirmed
- no fake data is used
- all reference geometry acceptance criteria are satisfied

---

# 30. FINAL DESIGN PRINCIPLE

The final SUGI ASAYAKE website must communicate:

- thoughtful curation
- premium quality
- Mongolian identity
- calm confidence
- editorial taste
- real product value
- clear membership benefit
- trustworthy ecommerce behavior

The design should look deliberately art-directed, not automatically generated.

Reproduce the references’:

- geometry
- composition
- rhythm
- scale
- asymmetry
- surface contrast
- image treatment
- typography hierarchy
- responsive transformation

while preserving SUGI ASAYAKE’s:

- colors
- Mongolian content
- real product data
- real loyalty system
- real checkout
- real authentication
- real admin permissions
- real Cloudflare R2 media
- real customer privacy
- real server-authoritative business rules

The most important relationship in the membership section is:

```text
eligible lifetime spend
→ current membership tier
→ discount percentage
→ actual money saved
```

The left infinity loop represents membership progress and eligible spend.

The right infinity loop represents current discount percentage.

The saved-money value is a separate real metric.

Never merge these meanings into one misleading number.
The graphic must communicate this exact relationship:

lifetime eligible spend → membership tier → discount percentage → actual money saved.

The left loop is not “money saved”.
The right loop is not “progress”.
Every value must be labeled and mathematically correct.
REFERENCE IMAGE: QUICK STATS → SUGI ASAYAKE MEMBERSHIP SAVINGS SECTION

The attached image is the exact visual composition reference.
Rebuild this section as a real data-driven SUGI ASAYAKE loyalty/membership
savings section.

Do not create a generic statistic section.
Do not create two ordinary circular progress charts.
Do not show fake numbers such as “300” or “82%”.
Do not use placeholder metrics.
The visual may resemble the reference, but all numbers must come from
the real SUGI loyalty system or be clearly labeled as example/public data.

==================================================
1. BUSINESS PURPOSE
==================================================

Replace the existing “Quick Stats” section with:

- customer membership status
- current loyalty tier
- current discount percentage
- amount of money saved through loyalty discounts
- progress toward the next tier
- clear explanation of how the customer can save more

Existing real loyalty tiers are:

- Стандарт: 0% discount, minimum lifetime spend ₮0
- Хүрэл: 3% discount, minimum lifetime spend ₮500,000
- Мөнгөн: 5% discount, minimum lifetime spend ₮1,000,000
- Алтан: 10% discount, minimum lifetime spend ₮10,000,000

The existing shared loyalty source of truth is:
shared/loyalty.ts

Do not duplicate or redefine these tiers in the frontend.
Import the shared loyalty definitions.

==================================================
2. DATA RULES
==================================================

Authenticated customer:
- show the customer’s real lifetime eligible spend
- show the real current loyalty tier
- show the real current discount percentage
- show the real accumulated loyalty discount savings if the server already
  exposes it
- if accumulated savings is not currently stored, calculate it only from
  authoritative order/discount data or explicitly label it as unavailable
- never guess
- never display ₮0 as a fake fallback when the data is unavailable
- show loading state while the data is loading
- show an honest unavailable state if the metric cannot be calculated

Guest visitor:
- do not show another customer’s private data
- show a public membership explainer using the real tier table:
  “3% хүртэл”, “5% хүртэл”, “10% хүртэл”
- label it clearly as a public example/benefit overview
- show a CTA to log in or view membership details
- do not pretend the guest personally saved money

If an authenticated customer has:
- current tier = Хүрэл → display 3%
- current tier = Мөнгөн → display 5%
- current tier = Алтан → display 10%
- current tier = Стандарт → display 0%

Money saved formula:
- only use real loyalty discount amounts from completed/eligible orders
- do not use gross order total as “saved money”
- do not count cancelled or returned orders unless existing business rules explicitly
  include them
- do not count coupon, routine or promotion discounts as loyalty savings
- clearly distinguish:
  1. loyalty discount percentage
  2. total loyalty money saved
  3. progress toward next tier

If the backend does not currently expose accumulated loyalty savings:
- add a read-only server query only if necessary
- do not change checkout mutations
- do not change payment behavior
- do not change discount enforcement
- keep the server authoritative
- add tests for the calculation
- never calculate historical savings from unreliable client state

==================================================
3. OUTER SECTION GEOMETRY
==================================================

The reference section is a wide light editorial block.

Desktop:
- full-width warm ivory / off-white background
- content centered in a wide frame
- section feels like a calm financial/membership dashboard inside a luxury
  retail website
- no heavy card shadow around the entire section
- no generic SaaS panel border
- use a thin horizontal divider above the section if it exists in the page
- retain the existing SUGI warm paper visual language

Suggested colors:
- section background: #fffdf9 or #f8f5ef
- primary ink: #17181b
- muted text: #77787d
- warm border: #ded9d0
- copper/rose graph: muted terracotta, not bright red
- second graph tone: warm gray / charcoal
- savings accent: SUGI gold #f0b52d
- CTA accent: SUGI vermilion #df1f3d

Do not turn the entire section dark.
The reference Quick Stats canvas is light and airy.

Desktop inner frame:
- max-width approximately 1200–1320px
- horizontal padding approximately 48–72px
- large top/bottom whitespace
- two main columns:
  - left editorial copy: 28–34%
  - right graph/stat stage: 60–68%
- gap approximately 70–120px
- content vertically centered

==================================================
4. TOP TICKER / TRUST STRIP
==================================================

If the existing homepage has the thin announcement/trust strip above this
section, preserve it and style it as a narrow editorial ticker.

Reference behavior:
- thin horizontal strip
- compact uppercase/letter-spaced text
- multiple short messages separated by small dots
- dark or muted strip depending on surrounding section
- low-height, not a large banner
- no distracting animation
- respect reduced motion

Use real SUGI messages only, such as:
- БАТАЛГААТ БҮТЭЭГДЭХҮҮН
- ХҮРГЭЛТТЭЙ
- ГИШҮҮНЧЛЭЛИЙН ХӨНГӨЛӨЛТ
- САЛБАРТ ОЧИЖ АВАХ БОЛОМЖТОЙ

Do not invent unsupported claims.

Below the ticker, the reference has three compact trust/feature cells.
Preserve or adapt them only if they already exist in the current homepage.
They must not overpower Quick Stats.

==================================================
5. LEFT “QUICK STATS” EDITORIAL BLOCK
==================================================

The left side is not a normal card.

Heading:
- display text:
  “Quick
   Stats”
  or approved Mongolian equivalent:
  “Гишүүнчлэлийн
   хэмнэлт”
- use intentional two-line or three-line break
- left-aligned
- large display sans
- tight letter spacing
- dark ink
- approximately 52–78px desktop
- line-height approximately 0.88–0.98
- do not center
- do not make it a tiny dashboard label

Recommended SUGI content:
- small eyebrow: “ГИШҮҮНЧЛЭЛ”
- main title: “Илүү их худалдан авалт, илүү их хэмнэлт.”
- or:
  “Таны
   хэмнэлт
   өснө.”

If using the English “Quick Stats” label:
- preserve the visual reference
- add a clear Mongolian explanatory title nearby
- do not make English the only meaning

Description:
- width approximately 250–340px
- muted gray text
- 13–15px
- line-height 1.55–1.7
- explain that the membership discount grows according to lifetime eligible spend
- do not use vague marketing text

Example:
“Таны нийт худалдан авалтын дүн өсөх тусам гишүүнчлэлийн түвшин ахиж,
дараагийн захиалга бүр дээр илүү их хэмнэлт үүснэ.”

CTA:
- small editorial text-link, not a giant button
- examples:
  “Гишүүнчлэлийн нөхцөл харах →”
  “Профайл руу орох →”
- use real route
- keyboard accessible
- visible on touch screens

Authenticated additional metadata:
- current tier name
- lifetime eligible spend
- next tier name
- remaining amount to next tier

Guest additional metadata:
- “Нэвтэрснээр өөрийн хэмнэлтийг хараарай”
- no private values

==================================================
6. RIGHT GRAPH STAGE — INFINITY SAVINGS GRAPH
==================================================

The main graphic must visually resemble the reference’s connected infinity
shape, not two unrelated donut charts.

Desktop geometry:
- graph stage occupies approximately 58–68% of the section width
- visual width approximately 540–680px
- visual height approximately 230–330px
- centered vertically
- no enclosing card border
- plenty of empty space around the graphic

Graph shape:
- one continuous infinity / figure-eight path
- left loop and right loop overlap at the center
- left loop slightly warm copper/rose
- right loop warm charcoal/gray or muted gold
- background track is pale gray-beige
- active progress is colored
- line thickness approximately 14–22px desktop
- line ends are rounded
- no sharp square caps
- no neon gradient
- no 3D effect
- no overly glossy effect
- subtle, restrained luxury appearance

Implementation options:
- SVG is preferred for precise geometry
- CSS border circles are acceptable only if the infinity overlap is visually correct
- do not use a chart library if it creates generic donut charts
- SVG paths must have accessible labels or adjacent text
- animate progress only subtly
- respect prefers-reduc

