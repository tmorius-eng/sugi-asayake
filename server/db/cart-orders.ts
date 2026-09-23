// server/db/cart-orders.ts — Сагс, сагснаас захиалга, дэлгүүрийн борлуулалт (POS).
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, asc, desc, eq, gte, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import { branches, branchStock, cartItems, carts, discountCodeRedemptions, discountCodes, orderItems, orders, productVariants, products, storeCreditLedger, users } from "../../drizzle/schema";
import { guessDistrictFromAddress, type UbDistrict } from "../../shared/districts";
import { computeDeliveryFeeMnt } from "../../shared/delivery";
import { discountableSubtotalMnt, isDigitalOnlyBasket, isGiftCardLine } from "../../shared/gift-cards";
import { invalidateCachedByPrefix } from "../_core/ttlCache";
import { enqueueNotification } from "../notificationOutbox";
import { recordStockMovement } from "../stockLedger";
import { getInventoryReservationFailure } from "../commerce-lifecycle";
import { escapeLike, generateOrderNumber, getDb, isDuplicateKeyError, isDuplicateOrderNumberError } from "./connection";
import { DbOrTx, decrementBranchStock } from "./admin-orders";
import { getActiveBranches } from "./site";
import { getStoreSettingNumber } from "./ops";
import { getApplicableRoutineDiscount } from "./routines-promotions";
import { discountRedemptionKey, validateDiscountCode } from "./discounts";
import { getApplicableLoyaltyDiscount } from "./customers";
import { IssuedGiftCard, issueGiftCardsForPaidOrder } from "./gift-cards";

/**
 * Identifies who a cart (or an in-progress checkout) belongs to: either a
 * logged-in account, or an anonymous shopper via the guest-cart cookie (see
 * shared/const.ts GUEST_CART_COOKIE_NAME). Exactly one of the two is set —
 * mirrors the nullable `carts.userId` / `carts.guestToken` columns.
 */
export type CartOwner = { userId: number; guestToken?: undefined } | { userId?: undefined; guestToken: string };

function cartOwnerCondition(owner: CartOwner) {
  return owner.userId !== undefined ? eq(carts.userId, owner.userId) : eq(carts.guestToken, owner.guestToken);
}

/**
 * PHASE 2 of product variants: every cart line is keyed by variantId and
 * joined through productVariants to reach the parent product. `productId`/
 * `name`/`slug` below come from that join (there's no productId column on
 * cart_items any more — see the schema comment on cartItems). `sku` and
 * `attributesJson` are the variant's own, real ones (this is also what fixed
 * the old order_items.sku bug -- see createOrderFromActiveCart). `imageUrl`
 * falls back to the parent product's photo when a variant has none of its
 * own (most variants won't bother with a separate photo).
 */
export async function getActiveCartForOwner(owner: CartOwner) {
  const db = await getDb();
  if (!db) return null;

  const cart = await db
    .select({ id: carts.id, status: carts.status, updatedAt: carts.updatedAt })
    .from(carts)
    .where(and(cartOwnerCondition(owner), eq(carts.status, "active")))
    .orderBy(desc(carts.updatedAt))
    .limit(1);

  if (!cart[0]) return null;

  const items = await db
    .select({
      id: cartItems.id,
      variantId: cartItems.variantId,
      productId: productVariants.productId,
      quantity: cartItems.quantity,
      name: products.name,
      nameMn: products.nameMn,
      slug: products.slug,
      sku: productVariants.sku,
      priceMnt: productVariants.priceMnt,
      compareAtPriceMnt: productVariants.compareAtPriceMnt,
      imageUrl: sql<string | null>`coalesce(${productVariants.imageUrl}, ${products.imageUrl})`,
      stockQuantity: productVariants.stockQuantity,
      attributesJson: productVariants.attributesJson,
      // Gift cards sold at checkout (2026-09-14): a digital line is skipped
      // by the stock decrement, so checkout checks "still on sale" itself.
      kind: products.kind,
      isPublished: products.isPublished,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(cartItems.cartId, cart[0].id));

  return { ...cart[0], items };
}

async function getOrCreateActiveCart(owner: CartOwner) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const active = await getActiveCartForOwner(owner);
  if (active) return active;
  const inserted = await db.insert(carts).values({ userId: owner.userId ?? null, guestToken: owner.guestToken ?? null, status: "active" });
  const created = await db.select({ id: carts.id, status: carts.status, updatedAt: carts.updatedAt }).from(carts).where(eq(carts.id, Number(inserted[0].insertId))).limit(1);
  if (!created[0]) throw new Error("Unable to create an active cart.");
  return { ...created[0], items: [] };
}

/**
 * PHASE 2 of product variants: exactly one of productId/variantId is
 * expected (enforced by the router's zod schema). productId resolves to
 * that product's current default variant — this is what keeps every
 * existing call site (Shop quick-add, routine bulk-add, Profile reorder,
 * quick-view without a picker) working unchanged with zero client
 * changes, while a real variant picker (ProductDetail/QuickView, only
 * rendered when a product actually has more than one variant) passes
 * variantId directly to buy a specific option.
 */
export async function addCartItem(input: { owner: CartOwner; quantity: number; productId?: number; variantId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const variantSelect = { id: productVariants.id, stockQuantity: productVariants.stockQuantity, isPublished: products.isPublished };
  const variantRow = input.variantId !== undefined
    ? await db.select(variantSelect).from(productVariants).innerJoin(products, eq(productVariants.productId, products.id)).where(eq(productVariants.id, input.variantId)).limit(1)
    : await db.select(variantSelect).from(productVariants).innerJoin(products, eq(productVariants.productId, products.id)).where(and(eq(productVariants.productId, input.productId!), eq(productVariants.isDefault, true))).limit(1);
  if (!variantRow[0]?.isPublished) throw new Error("This product is not currently available for ordering.");
  const variantId = variantRow[0].id;

  const cart = await getOrCreateActiveCart(input.owner);

  // Read-modify-write on the existing quantity used to happen outside any
  // lock: two concurrent "add to cart" calls for the same variant (a double
  // click, two open tabs, guest-cart merge racing a manual add) could both
  // read the same starting quantity and clobber each other's increment. The
  // cart-row lock below serializes every addItem for this cart so that can't
  // happen, while still throwing the same "not enough stock" error as before.
  await db.transaction(async tx => {
    await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cart.id)).for("update");
    const existing = await tx.select().from(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId))).limit(1);
    const quantity = (existing[0]?.quantity ?? 0) + input.quantity;
    if (quantity > variantRow[0].stockQuantity) throw new Error("The requested quantity is not available in stock.");

    if (existing[0]) {
      await tx.update(cartItems).set({ quantity, updatedAt: new Date() }).where(eq(cartItems.id, existing[0].id));
    } else {
      await tx.insert(cartItems).values({ cartId: cart.id, variantId, quantity });
    }
  });
  return getActiveCartForOwner(input.owner);
}

export async function updateCartItemQuantity(input: { owner: CartOwner; itemId: number; quantity: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const row = await db
    .select({ itemId: cartItems.id, cartId: carts.id, variantId: productVariants.id, stockQuantity: productVariants.stockQuantity })
    .from(cartItems)
    .innerJoin(carts, eq(cartItems.cartId, carts.id))
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .where(and(eq(cartItems.id, input.itemId), cartOwnerCondition(input.owner), eq(carts.status, "active")))
    .limit(1);
  if (!row[0]) throw new Error("Cart item not found.");
  if (input.quantity === 0) {
    await db.delete(cartItems).where(eq(cartItems.id, row[0].itemId));
  } else {
    if (input.quantity > row[0].stockQuantity) throw new Error("The requested quantity is not available in stock.");
    await db.update(cartItems).set({ quantity: input.quantity, updatedAt: new Date() }).where(eq(cartItems.id, row[0].itemId));
  }
  return getActiveCartForOwner(input.owner);
}

/**
 * Folds a guest cart into the now-logged-in user's cart (called right after
 * auth.login / auth.register when a guest-cart cookie is present). Best
 * effort: a line that no longer fits in stock is silently dropped rather
 * than failing the login. The guest cart itself is marked "converted" so its
 * (now stale) cookie can't be reused.
 */
export async function mergeGuestCartIntoUserCart(guestToken: string, userId: number) {
  const db = await getDb();
  if (!db) return;
  const guestCart = await getActiveCartForOwner({ guestToken });
  if (!guestCart || guestCart.items.length === 0) return;

  for (const item of guestCart.items) {
    try {
      await addCartItem({ owner: { userId }, variantId: item.variantId, quantity: item.quantity });
    } catch {
      // Out of stock, or the product was unpublished since it was added — skip this line.
    }
  }
  await db.update(carts).set({ status: "converted", updatedAt: new Date() }).where(eq(carts.id, guestCart.id));
}

/**
 * The order an earlier submission of this checkout attempt produced, or null.
 * The key is a random UUID the browser made, so it cannot be guessed; the
 * owner check is for the signed-in case regardless, so a shopper can never
 * be handed somebody else's order. Items come from order_items because the
 * cart that produced them has already been converted.
 */
export async function findOrderForClientRequest(db: DbOrTx, clientRequestId: string, expectedUserId: number | null | undefined, options: { guestOnly?: boolean } = {}) {
  const [existing] = await db.select().from(orders).where(eq(orders.clientRequestId, clientRequestId)).limit(1);
  if (!existing) return null;
  // `undefined` = no account to compare against (a guest, or a cashier).
  //
  // 2026-09-23: ЗОЧНЫ зам нь бүртгэлтэй хэрэглэгчийн захиалгыг буцаах ёсгүй
  // (өмнө нь зөвхөн 8–64 тэмдэгтийн санамсаргүй id л нэр/утас/хаягийг
  // хамгаалдаг байв). Гэхдээ энэ шалгалт `undefined`-д бүхэлдээ хамаарвал
  // КАССЫГ (`recordInStoreSale`, мөн `undefined` дамжуулдаг) эвдэнэ:
  // гишүүн харилцагчийн борлуулалт `userId`-тай бичигддэг тул давхар
  // товшилтын replay олдохгүй, дараа нь UNIQUE зөрчилд унаж кассчинд
  // "INTERNAL" алдаа харагдана. Тиймээс зочны хязгаарлалтыг ЗӨВХӨН checkout
  // тодорхой хүсэх үед (`guestOnly`) хэрэглэнэ.
  if (options.guestOnly && existing.userId !== null) return null;
  if (expectedUserId !== undefined && existing.userId !== expectedUserId) return null;
  const items = await db.select({ productName: orderItems.productName, quantity: orderItems.quantity, unitPriceMnt: orderItems.unitPriceMnt }).from(orderItems).where(eq(orderItems.orderId, existing.id));
  return {
    ...existing,
    items: items.map(item => ({ name: item.productName, quantity: item.quantity, priceMnt: item.unitPriceMnt, attributesJson: null as string | null })),
    routineName: null as string | null,
    replayed: true as const,
  };
}

/**
 * Роутерийн түвшний replay хайлт (2026-09-23): `createOrder` нь утасны
 * баталгаажуулалтыг шалгахаасаа ӨМНӨ ижил `clientRequestId`-тай захиалга аль
 * хэдийн үүссэн эсэхийг мэдэх ёстой (эс бөгөөс алдагдсан хариуны дахин
 * илгээлт "сесс ашиглагдсан" гэж буцаагдана).
 */
export async function findExistingOrderForClientRequest(clientRequestId: string, owner: CartOwner) {
  const db = await getDb();
  if (!db) return null;
  // Зочин (`owner.userId === undefined`) бол зөвхөн зочны захиалга.
  return findOrderForClientRequest(db, clientRequestId, owner.userId, { guestOnly: owner.userId === undefined });
}

export async function createOrderFromActiveCart(input: {
  owner: CartOwner;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  deliveryMethod: "ub_delivery" | "store_pickup";
  deliveryAddress?: string | null;
  district?: UbDistrict | null;
  pickupBranch?: string | null;
  paymentMethod: "qpay" | "storepay" | "bank_transfer" | "card" | "cash_on_delivery";
  couponCode?: string | null;
  trafficSource?: string | null;
  deviceType?: "mobile" | "tablet" | "desktop" | "unknown";
  visitorSessionId?: number | null;
  /** Idempotency key from the browser (see orders.clientRequestId). */
  clientRequestId?: string | null;
  // "Controls everything" admin overhaul (2026-09-08, Phase I): how much of
  // the customer's own store credit balance they opted to apply, requested
  // by the client -- re-validated against their REAL balance below, never
  // trusted as-is (same "never trust a client-supplied amount" discipline
  // as couponCode above). Guests (no owner.userId) can never have a
  // balance, so this is silently ignored for them rather than erroring.
  applyStoreCreditMnt?: number | null;
}, options?: { generateOrderNumber?: () => string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  // A retry of an attempt the server already committed -- a request that
  // timed out on a mobile connection after the commit, a browser resend, a
  // second tab -- returns the order that attempt produced instead of placing
  // the basket again (2026-09-12).
  if (input.clientRequestId) {
    const replay = await findOrderForClientRequest(db, input.clientRequestId, input.owner.userId, { guestOnly: input.owner.userId === undefined });
    if (replay) return replay;
  }
  const cart = await getActiveCartForOwner(input.owner);
  if (!cart?.items.length) throw new Error("Your cart is empty.");
  // Gift cards sold at checkout (2026-09-14, shared/gift-cards.ts): digital
  // lines have no shelf, a basket of only gift cards has no delivery and
  // no pickup branch, and no percentage discount ever applies to them.
  const digitalOnly = isDigitalOnlyBasket(cart.items);
  const discountBaseMnt = discountableSubtotalMnt(cart.items);
  const availabilityFailure = getInventoryReservationFailure(cart.items.filter(item => !isGiftCardLine(item)));
  if (availabilityFailure) throw new Error(availabilityFailure);
  // "Controls everything" admin overhaul (2026-09-08, Phase J/L): validated
  // against the real, live branches table here (the actual authority),
  // rather than a hardcoded zod enum in the router -- the exact class of
  // bug that used to make branch 04 unselectable (it existed in
  // locations-data.ts's array but not in the router's separate, stale
  // 3-branch enum). Same "never trust a client string, check it against
  // real DB state" discipline as couponCode above. Also resolves WHICH
  // branch's shelf this order actually draws from (Phase L: per-branch
  // stock, not one shared global pool) -- store_pickup draws from the
  // customer's chosen branch, ub_delivery from whichever branch is
  // isFulfillmentDefault right now. Captured as a real id (fulfillingBranchId,
  // set on the order below) rather than re-derived later, so a future
  // change to which branch is the default never misattributes an already-
  // placed order's stock effect.
  const activeBranchesForOrder = await getActiveBranches();
  const fulfillmentBranch = activeBranchesForOrder.find(branch => branch.isFulfillmentDefault);
  let fulfillingBranchId: number | null = null;
  if (input.deliveryMethod === "store_pickup" && !digitalOnly) {
    // Pickup is only ever at a STORE (2026-09-11) -- a warehouse is not a
    // place a shopper can walk into, even if someone posts its name.
    const matchedBranch = input.pickupBranch ? activeBranchesForOrder.find(branch => branch.name === input.pickupBranch && branch.kind === "store") : undefined;
    if (!matchedBranch) throw new Error("Select a valid SUGI branch for store pickup.");
    if (matchedBranch.countsTowardOnlineStock) {
      fulfillingBranchId = matchedBranch.id;
    } else {
      // This store's shelf is not what the website sells (its sales go
      // through Smart POS, not here), so the goods come from the warehouse
      // and are brought to the store; the order still records the store the
      // customer picks up from in pickupBranch.
      if (!fulfillmentBranch) throw new Error("No fulfilment branch is configured. Please contact support.");
      fulfillingBranchId = fulfillmentBranch.id;
    }
  } else {
    if (!fulfillmentBranch) throw new Error("No fulfilment branch is configured. Please contact support.");
    fulfillingBranchId = fulfillmentBranch.id;
  }

  const subtotalMnt = cart.items.reduce((sum, item) => sum + item.priceMnt * item.quantity, 0);
  // "Controls everything" admin overhaul (2026-09-08, Phase B): both numbers
  // now come from store_settings (admin-editable), falling back to today's
  // hardcoded UB_DELIVERY_FEE_MNT/no-threshold behavior when unset -- this
  // is the one authoritative place the actual charge is computed (Checkout.tsx
  // only ever displays a preview of this same logic, never the source of
  // truth). Free-shipping threshold checks the pre-discount subtotal, the
  // conventional "order amount" a shopper compares against a free-shipping
  // banner -- not the post-discount payable total.
  const [deliveryFeeUbMnt, freeShippingThresholdMnt] = await Promise.all([
    getStoreSettingNumber("delivery-fee-ub-mnt"),
    getStoreSettingNumber("free-shipping-threshold-mnt"),
  ]);
  // Audit 2026-09-09: the ONE delivery-fee rule, shared with Checkout.tsx's
  // preview (shared/delivery.ts) -- no second hand-copied formula.
  const deliveryFeeMnt = computeDeliveryFeeMnt({ deliveryMethod: input.deliveryMethod, subtotalMnt, deliveryFeeUbMnt, freeShippingThresholdMnt, digitalOnly });
  // PREMIUM-FEATURES.md TIER 4: computed from the cart's real contents right
  // now, not a client-supplied amount — see getApplicableRoutineDiscount.
  const routineDiscount = await getApplicableRoutineDiscount(cart.items);
  const discountMnt = routineDiscount?.discountMnt ?? 0;
  // Coupon (manually entered) applies to the subtotal *after* the routine
  // discount. Re-validated here (never trusts a client-supplied amount) —
  // if the code has gone stale between the checkout-preview call and now
  // (expired, used up, deactivated), the whole order fails with a clear
  // error rather than silently dropping the discount the shopper was shown.
  const couponResult = input.couponCode ? await validateDiscountCode(input.couponCode, discountBaseMnt - discountMnt, { userId: input.owner.userId ?? null, phone: input.customerPhone }) : null;
  const couponDiscountMnt = couponResult?.discountMnt ?? 0;
  // PREMIUM-FEATURES.md TIER 5: loyalty applies to the subtotal after both
  // the routine discount and the coupon — sequential stacking throughout,
  // never multiple percentages computed off the same base.
  const loyaltyDiscount = await getApplicableLoyaltyDiscount(input.owner.userId, discountBaseMnt - discountMnt - couponDiscountMnt);
  const loyaltyDiscountMnt = loyaltyDiscount?.discountMnt ?? 0;
  // Prefer whatever the checkout form actually sent (a shopper picking
  // their saved address's district, or the dropdown next to a fresh
  // address); fall back to a best-effort guess from the free-text address
  // itself, so a district is captured even when the client doesn't send
  // one — see shared/districts.ts and scripts/backfill-order-districts.ts.
  const deliveryDistrict = input.deliveryMethod === "ub_delivery" ? (input.district ?? guessDistrictFromAddress(input.deliveryAddress)) : null;
  const payableBeforeCreditMnt = subtotalMnt + deliveryFeeMnt - discountMnt - couponDiscountMnt - loyaltyDiscountMnt;
  // Phase I: credit is cash-equivalent, so it's applied LAST against the
  // already-discounted total, never stacked into the routine/coupon/loyalty
  // percentage math above. Capped at both the real balance (read fresh here,
  // not trusted from the client) and the payable total (can never make
  // totalMnt negative). The atomic guarded UPDATE inside the transaction
  // below is the actual race-proof enforcement, matching every other
  // decrement in this function -- this is only an optimistic pre-check.
  let storeCreditAppliedMnt = 0;
  if (input.owner.userId && input.applyStoreCreditMnt && input.applyStoreCreditMnt > 0) {
    const [creditRow] = await db.select({ storeCreditMnt: users.storeCreditMnt }).from(users).where(eq(users.id, input.owner.userId)).limit(1);
    storeCreditAppliedMnt = Math.max(0, Math.min(input.applyStoreCreditMnt, creditRow?.storeCreditMnt ?? 0, payableBeforeCreditMnt));
  }
  let orderId = 0;
  // The whole checkout transaction, parameterised by the order number so it
  // can be re-run with a fresh one on the (rare) UNIQUE collision -- see
  // generateOrderNumber / isDuplicateOrderNumberError. A failed attempt has
  // been fully rolled back (stock, coupon, credit), so re-running is safe.
  const placeOrderTransaction = (orderNumber: string) => db.transaction(async tx => {
    const trackedItems: { variantId: number; quantity: number }[] = [];
    for (const item of cart.items) {
      if (isGiftCardLine(item)) {
        // Digital: nothing leaves a shelf. It still has to be on sale --
        // the requirePublished check below is what enforces that for
        // physical lines, so mirror it here.
        if (!item.isPublished) throw new Error(`${item.name} одоогоор зарагдахгүй байна.`);
        continue;
      }
      // "Controls everything" admin overhaul (2026-09-08, Phase L): decrements
      // the SPECIFIC fulfilling branch's shelf now, not one shared global
      // pool -- see decrementBranchStock's own doc-comment for the full
      // reasoning (race-proof guard, legacy fallback, isPublished check).
      if (await decrementBranchStock(tx, fulfillingBranchId, item.variantId, item.quantity, { requirePublished: true, itemLabel: item.name })) {
        trackedItems.push({ variantId: item.variantId, quantity: item.quantity });
      }
    }
    if (couponResult) {
      // Same WHERE-guard technique as the stock decrement above: atomic, so
      // two simultaneous orders can never both redeem the last remaining use
      // of a maxUses-limited code. Losing this race rolls back the whole
      // order (stock included) via the thrown error.
      const redeemed = await tx.update(discountCodes)
        .set({ usesCount: sql`${discountCodes.usesCount} + 1`, updatedAt: new Date() })
        .where(and(eq(discountCodes.id, couponResult.id), or(isNull(discountCodes.maxUses), lt(discountCodes.usesCount, discountCodes.maxUses))));
      if (Number(redeemed[0].affectedRows ?? 0) !== 1) {
        throw new Error("Энэ хямдралын код яг энэ мөчид дууссан байна. Дахин оролдоно уу.");
      }
    }
    const inserted = await tx.insert(orders).values({
      userId: input.owner.userId ?? null,
      orderNumber,
      paymentMethod: input.paymentMethod,
      deliveryMethod: input.deliveryMethod,
      deliveryAddress: input.deliveryAddress ?? null,
      deliveryDistrict,
      pickupBranch: input.pickupBranch ?? null,
      fulfillingBranchId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail ?? null,
      // Both captured once, at order time, same as everything else above —
      // never backfilled for historical orders (see the schema comment on
      // orders.trafficSource/deviceType).
      trafficSource: input.trafficSource ?? null,
      deviceType: input.deviceType ?? "unknown",
      visitorSessionId: input.visitorSessionId ?? null,
      clientRequestId: input.clientRequestId ?? null,
      subtotalMnt,
      deliveryFeeMnt,
      discountMnt,
      appliedRoutineId: routineDiscount?.routineId ?? null,
      couponCode: couponResult?.code ?? null,
      couponDiscountMnt,
      loyaltyDiscountMnt,
      appliedLoyaltyTierName: loyaltyDiscount?.tierName ?? null,
      storeCreditAppliedMnt,
      totalMnt: payableBeforeCreditMnt - storeCreditAppliedMnt,
    });
    orderId = Number(inserted[0].insertId);
    // Нэг хэрэглэгчийн купон хязгаарын АТОМИК хамгаалалт (2026-09-16, migration
    // 0084). Дээрх validateDiscountCode-ийн тоолол нь гүйлгээнээс ГАДНА явдаг
    // тул хоёр зэрэгцээ checkout хоёулаа "хараахан ашиглаагүй" гэж уншиж
    // чаддаг байв. Энд (код, хэрэглэгч, дугаар) гурвалыг өвөрмөц индекстэй
    // мөр болгон бичнэ — хожигдсон тал давхардлын алдаанд унаж, захиалга
    // бүхэлдээ (нөөц, купоны тоолуур хамт) буцна.
    if (couponResult && couponResult.maxUsesPerCustomer !== null) {
      const redemptionKey = discountRedemptionKey({ userId: input.owner.userId ?? null, phone: input.customerPhone });
      if (redemptionKey) {
        const [used] = await tx.select({ count: sql<number>`count(*)` }).from(discountCodeRedemptions)
          .where(and(eq(discountCodeRedemptions.discountCodeId, couponResult.id), eq(discountCodeRedemptions.customerKey, redemptionKey)));
        const usedCount = Number(used?.count ?? 0);
        if (usedCount >= couponResult.maxUsesPerCustomer) {
          throw new Error(couponResult.maxUsesPerCustomer === 1 ? "Та энэ кодыг аль хэдийн ашигласан байна." : `Энэ кодыг нэг хэрэглэгч хамгийн ихдээ ${couponResult.maxUsesPerCustomer} удаа ашиглана — та хязгаартаа хүрсэн байна.`);
        }
        try {
          await tx.insert(discountCodeRedemptions).values({ discountCodeId: couponResult.id, customerKey: redemptionKey, seq: usedCount + 1, orderId });
        } catch (error) {
          if (isDuplicateKeyError(error, "discount_code_redemptions_slot")) {
            throw new Error("Энэ кодыг яг энэ мөчид өөр захиалгаар ашиглаж байна. Дахин оролдоно уу.", { cause: error });
          }
          throw error;
        }
      }
    }
    await tx.insert(orderItems).values(cart.items.map(item => ({
      orderId,
      productId: item.productId,
      // PHASE 2 of product variants: fixes a pre-existing bug where this
      // used to write item.slug (the product's URL slug) here instead of a
      // real SKU/barcode, because the cart-items query never selected one.
      variantId: item.variantId,
      productName: item.name,
      sku: item.sku,
      unitPriceMnt: item.priceMnt,
      quantity: item.quantity,
    })));
    // Stock ledger (2026-09-11): the decrements above, now that the order id
    // exists to point them at. Same transaction, so they roll back together.
    for (const item of trackedItems) {
      await recordStockMovement(tx, fulfillingBranchId, item.variantId, -item.quantity, { type: "sale_online", refType: "order", refId: orderId, actorUserId: null });
    }
    // Phone push to the warehouse (2026-09-11). Inside the transaction, so a
    // checkout that fails further down (coupon race, credit race) never
    // announced an order that does not exist. No customer PII in it.
    await enqueueNotification(tx, "order.placed", {
      orderNumber,
      totalMnt: payableBeforeCreditMnt - storeCreditAppliedMnt,
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      deliveryMethod: input.deliveryMethod,
      paymentMethod: input.paymentMethod,
      pickupBranchName: input.deliveryMethod === "store_pickup" ? (input.pickupBranch ?? null) : null,
    }, { dedupeKey: `order:${orderId}` });
    if (storeCreditAppliedMnt > 0) {
      // Same WHERE-guard + affectedRows race-proof idiom as the stock/coupon
      // decrements above -- if a concurrent spend already ate into this
      // balance since the optimistic pre-check, the whole order (stock
      // included) rolls back via the thrown error, same as losing the
      // coupon race above.
      const creditUpdate = await tx.update(users)
        .set({ storeCreditMnt: sql`${users.storeCreditMnt} - ${storeCreditAppliedMnt}`, updatedAt: new Date() })
        .where(and(eq(users.id, input.owner.userId!), gte(users.storeCreditMnt, storeCreditAppliedMnt)));
      if (Number(creditUpdate[0].affectedRows ?? 0) !== 1) {
        throw new Error("Дэлгүүрийн зээлийн үлдэгдэл өөрчлөгдсөн байна. Захиалгаа дахин баталгаажуулна уу.");
      }
      await tx.insert(storeCreditLedger).values({
        userId: input.owner.userId!, deltaMnt: -storeCreditAppliedMnt,
        reason: `Захиалга ${orderNumber}-д зарцуулсан`, actorUserId: null, orderId,
      });
    }
    // Аудит 2026-09-20 (P0-1): сагсны шилжилт ч бусад decrement-тэй ижил
    // guarded-UPDATE идиомоор. Хоёр tab тус тусын clientRequestId-тай зэрэг
    // "Захиалга батлах" дарвал хоёулаа идэвхтэй сагсыг уншиж, нөөцийг хоёр удаа
    // хасаж, ХОЁР захиалга үүсгэж чадаж байв — replay хамгаалалт зөвхөн ИЖИЛ
    // ID-тэй давталтыг л барьдаг. Хожигдсон гүйлгээ энд унаж, нөөц/купон/зээл
    // бүгд буцна.
    const converted = await tx.update(carts).set({ status: "converted", updatedAt: new Date() }).where(and(eq(carts.id, cart.id), eq(carts.status, "active")));
    if (Number(converted[0].affectedRows ?? 0) !== 1) {
      throw new Error("Энэ сагс өөр захиалгаар аль хэдийн баталгаажсан байна. Захиалгын түүхээ шалгана уу.");
    }
  });
  const nextOrderNumber = options?.generateOrderNumber ?? generateOrderNumber;
  for (let attempt = 1; ; attempt++) {
    try {
      await placeOrderTransaction(nextOrderNumber());
      break;
    } catch (error) {
      if (attempt < 3 && isDuplicateOrderNumberError(error)) continue;
      // Two submissions of the same attempt raced and the other one won:
      // hand back its order rather than an error.
      if (input.clientRequestId && isDuplicateKeyError(error, "orders_client_request_unique")) {
        const replay = await findOrderForClientRequest(db, input.clientRequestId, input.owner.userId, { guestOnly: input.owner.userId === undefined });
        if (replay) return replay;
      }
      throw error;
    }
  }

  const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  // The cart's items are already in memory (loaded above, before the stock
  // decrement) — reuse them here instead of a redundant order_items query,
  // so the caller (checkout.createOrder) can build a confirmation email
  // without a second round trip.
  return { ...order[0], items: cart.items.map(item => ({ name: item.name, quantity: item.quantity, priceMnt: item.priceMnt, attributesJson: item.attributesJson })), routineName: routineDiscount?.routineName ?? null, replayed: false as const };
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase M): the POS
 * in-person-sale tool -- creates a REAL, queryable order (paymentStatus
 * "paid" the instant it's recorded, no separate confirmation step; a
 * physical sale is already complete by the time a staff member enters it)
 * and decrements the exact branch's stock via the same shared
 * decrementBranchStock helper checkout uses, just with requirePublished:
 * false (a shelf item's online-publish flag is irrelevant to an in-store
 * sale -- a staff member scanning a real barcode off a real shelf is its
 * own proof the item exists and is for sale). Unlike the old
 * `users.loyaltyManualAdjustmentMnt` bridge (PREMIUM-FEATURES.md:65 -- a
 * single lump-sum number with no line items, no SKUs, no stock effect),
 * this creates real order/order_items rows with real SKUs and a real
 * stock effect, going forward superseding the need for that bridge for
 * NEW in-store purchases -- it stays untouched for existing/historical
 * data. No manual price override in v1 -- always the variant's real, current
 * priceMnt (never a client-supplied number), same "never trust a client
 * amount" discipline as checkout's own discounts/credit.
 */
export type InStoreSaleInput = {
  branchId: number;
  items: { variantId: number; quantity: number }[];
  userId?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** The cashier -- recorded on the stock ledger movements. */
  actorUserId?: number | null;
  /** Idempotency key from the register screen (2026-09-12 audit) -- the same
   *  key always returns the same sale, so a resent request after a timeout or
   *  a double tap cannot ring the basket up twice. Same rule as checkout. */
  clientRequestId?: string | null;
};

export async function recordInStoreSale(input: InStoreSaleInput) {
  invalidateCachedByPrefix("storefront:bestsellers:");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (input.clientRequestId) {
    const replay = await findOrderForClientRequest(db, input.clientRequestId, undefined);
    if (replay) return { ...replay, replayed: true as const };
  }
  if (!input.items.length) throw new Error("Add at least one item to record a sale.");
  for (const item of input.items) {
    if (item.quantity < 1) throw new Error("Quantity must be at least 1 for every item.");
  }

  const branchRows = await db.select().from(branches).where(and(eq(branches.id, input.branchId), eq(branches.isActive, true))).limit(1);
  if (!branchRows[0]) throw new Error("Select a valid, active branch for this sale.");

  // Real, current price/name/sku -- never trusts a client-supplied amount.
  const variantIds = input.items.map(item => item.variantId);
  const variantRows = await db.select({
    id: productVariants.id, priceMnt: productVariants.priceMnt, sku: productVariants.sku,
    productId: productVariants.productId, productName: products.name,
    // 2026-09-23: `kind`. POS-ийн зарах зам нь бэлгийн картын мөрөөс ч
    // тавиурын нөөцийг хасаж, `sale_pos` дэвтрийн мөр бичдэг байсан —
    // онлайн checkout болон гар захиалга хоёулаа тэднийг алгасдаг. Дижитал
    // барааг 0 үлдэгдэлтэй хадгалдаг тул кассчинд "хүрэлцэхгүй" гэж
    // татгалздаг байв.
    kind: products.kind,
  }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, variantIds));
  const variantsById = new Map(variantRows.map(row => [row.id, row]));
  for (const item of input.items) {
    if (!variantsById.has(item.variantId)) throw new Error("One of the selected products no longer exists.");
  }

  const subtotalMnt = input.items.reduce((sum, item) => sum + variantsById.get(item.variantId)!.priceMnt * item.quantity, 0);
  // 2026-09-09 deep audit: this path minted its own 4-character order
  // number and never retried on a duplicate, so a collision surfaced as a
  // raw ER_DUP_ENTRY to the cashier. Same generator + retry as checkout.
  let orderId = 0;
  let issuedGiftCards: IssuedGiftCard[] = [];
  const recordSale = (orderNumber: string) => db.transaction(async tx => {
    const trackedItems: { variantId: number; quantity: number }[] = [];
    for (const item of input.items) {
      const variant = variantsById.get(item.variantId)!;
      // Бэлгийн карт бол физик нөөц байхгүй — нөөц ч, дэвтэр ч хөндөхгүй.
      if (variant.kind === "gift_card") continue;
      if (await decrementBranchStock(tx, input.branchId, item.variantId, item.quantity, { requirePublished: false, itemLabel: variant.productName })) {
        trackedItems.push({ variantId: item.variantId, quantity: item.quantity });
      }
    }
    const inserted = await tx.insert(orders).values({
      userId: input.userId ?? null,
      orderNumber,
      clientRequestId: input.clientRequestId ?? null,
      status: "completed",
      paymentMethod: "in_store",
      paymentStatus: "paid",
      deliveryMethod: "store_pickup",
      salesChannel: "in_store",
      pickupBranch: branchRows[0].name,
      fulfillingBranchId: input.branchId,
      // A register sale often has no captured contact info at all -- these
      // placeholders keep the NOT NULL columns honest without inventing a
      // fake person; a real name/phone (or userId) is used whenever given.
      customerName: input.customerName?.trim() || "Дэлгүүрийн худалдан авагч",
      customerPhone: input.customerPhone?.trim() || "-",
      subtotalMnt,
      totalMnt: subtotalMnt,
    });
    orderId = Number(inserted[0].insertId);
    await tx.insert(orderItems).values(input.items.map(item => {
      const variant = variantsById.get(item.variantId)!;
      return {
        orderId, productId: variant.productId, variantId: item.variantId,
        productName: variant.productName, sku: variant.sku,
        unitPriceMnt: variant.priceMnt, quantity: item.quantity,
      };
    }));
    for (const item of trackedItems) {
      await recordStockMovement(tx, input.branchId, item.variantId, -item.quantity, { type: "sale_pos", refType: "order", refId: orderId, actorUserId: input.actorUserId ?? null });
    }
    // A register sale is paid on the spot: gift cards on the receipt are
    // issued right here and handed back to the cashier (2026-09-14).
    issuedGiftCards = await issueGiftCardsForPaidOrder(tx, orderId);
  });
  for (let attempt = 1; ; attempt++) {
    try {
      await recordSale(generateOrderNumber());
      break;
    } catch (error) {
      if (attempt < 3 && isDuplicateOrderNumberError(error)) continue;
      // Two copies of one request raced past the check at the top; the
      // loser's insert hit the unique key, its stock decrement rolled back.
      if (input.clientRequestId && isDuplicateKeyError(error, "orders_client_request_unique")) {
        const replay = await findOrderForClientRequest(db, input.clientRequestId, undefined);
        if (replay) return { ...replay, replayed: true as const };
      }
      throw error;
    }
  }

  const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return { ...order[0], replayed: false as const, giftCards: issuedGiftCards };
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase M): the POS
 * line-item composer's search -- reuses the same name/SKU LIKE-search
 * shape this codebase already uses elsewhere (admin.search's product
 * lookup), scoped to variants (not products) since a POS sale is rung up
 * by real SKU, and joined against the SPECIFIC branch being sold from so a
 * cashier can see real shelf stock there while adding items (0 for a
 * variant this branch has no branch_stock row for, same LEFT JOIN
 * discipline as getBranchStockForVariant).
 */
export async function searchVariantsForBranch(branchId: number, search: string) {
  const db = await getDb();
  if (!db) return [];
  const trimmed = search.trim();
  // 2026-09-23: `%`/`_` нь LIKE-ийн орлуулагч тул хайлтын үгнээс салгана.
  const term = `%${escapeLike(trimmed)}%`;
  return db.select({
    variantId: productVariants.id,
    productId: productVariants.productId,
    productName: products.name,
    sku: productVariants.sku,
    priceMnt: productVariants.priceMnt,
    attributesJson: productVariants.attributesJson,
    stockAtBranch: sql<number>`COALESCE(${branchStock.stockQuantity}, 0)`,
  }).from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(branchStock, and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, productVariants.id)))
    .where(trimmed ? or(like(products.name, term), like(productVariants.sku, term)) : undefined)
    .orderBy(asc(products.name))
    .limit(30);
}
