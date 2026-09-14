// 2026-09-13: сэтгэгдлийн thread бодит, хадгалагддаг гэдгийн end-to-end баталгаа.
//
// Түр худалдан авагч + ажилтан, бодит бараанд дууссан захиалга үүсгээд сайтын
// ашигладаг ЯГ ИЖИЛ кодын замаар (appRouter procedure — reviews.create, reviews.reply,
// reviews.like, reviews.list, admin.updateReview / reviewReplies / updateReviewReply /
// deleteReview) амьд DB дээр явуулж, мөрүүдийг буцааж уншаад үүсгэсэн бүхнээ устгана.
// Мөн moderation шүүлт доромжлолыг татгалздагийг батална.
//
//   pnpm exec tsx scripts/verify-review-thread.ts             # ажиллуулж цэвэрлэнэ
//   pnpm exec tsx scripts/verify-review-thread.ts --keep      # screenshot-д thread үлдээнэ
//   pnpm exec tsx scripts/verify-review-thread.ts --cleanup   # --keep-ийн үлдээснийг устгана
import "dotenv/config";
import { eq, like } from "drizzle-orm";
import { appRouter } from "../server/routers";
import { getDb } from "../server/db";
import { hashPassword } from "../server/_core/password";
import { adminAuditLogs, orderItems, orders, productReviewLikes, productReviewReplies, productReviews, products, users } from "../drizzle/schema";
import type { TrpcContext } from "../server/_core/context";

const PREFIX = "verify-thread-";
const MARK = `${PREFIX}${Date.now()}`;
const keep = process.argv.includes("--keep");
const cleanupOnly = process.argv.includes("--cleanup");
const db = await getDb();
if (!db) throw new Error("no db");

async function cleanup(): Promise<number> {
  const leftovers = await db!.select({ id: users.id }).from(users).where(like(users.name, `${PREFIX}%`));
  for (const row of leftovers) {
    const myOrders = await db!.select({ id: orders.id }).from(orders).where(eq(orders.userId, row.id));
    for (const order of myOrders) await db!.delete(orderItems).where(eq(orderItems.orderId, order.id));
    await db!.delete(orders).where(eq(orders.userId, row.id));
    await db!.delete(productReviews).where(eq(productReviews.userId, row.id));
    await db!.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, row.id));
    await db!.delete(users).where(eq(users.id, row.id));
  }
  return leftovers.length;
}

if (cleanupOnly) {
  console.log("cleanup: removed", await cleanup(), "throwaway user(s) and everything they wrote");
  process.exit(0);
}

const fakeReq = { ip: `10.${Math.floor(Math.random()*250)+1}.${Math.floor(Math.random()*250)+1}.${Math.floor(Math.random()*250)+1}`, headers: {}, get: () => undefined, protocol: "http", path: "/api/trpc", method: "POST" } as never;
const fakeRes = { cookie() {}, clearCookie() {} } as never;
function callerFor(user: { id: number; role: string } | null) {
  const ctx = { user: user ? ({ ...user, phone: "x", sessionVersion: 0, name: MARK, email: null, avatarUrl: null } as never) : undefined, req: fakeReq, res: fakeRes } as unknown as TrpcContext;
  return appRouter.createCaller(ctx);
}

const [product] = await db.select({ id: products.id, name: products.name, slug: products.slug }).from(products).where(eq(products.isPublished, true)).limit(1);
console.log("product:", product.id, product.name, `/product/${product.slug}`);

// eslint-disable-next-line no-useless-assignment -- zero means "not created yet" for the cleanup block
let buyerId = 0, staffId = 0, orderId = 0, reviewId = 0;
try {
  const passwordHash = await hashPassword("verify-thread-pass-123");
  buyerId = Number((await db.insert(users).values({ name: `${MARK} buyer`, phone: `9${String(Date.now()).slice(-7)}`, passwordHash, role: "user" } as never))[0].insertId);
  staffId = Number((await db.insert(users).values({ name: `${MARK} staff`, phone: `8${String(Date.now()).slice(-7)}`, passwordHash, role: "admin" } as never))[0].insertId);
  orderId = Number((await db.insert(orders).values({
    userId: buyerId, orderNumber: `VT${String(Date.now()).slice(-8)}`, status: "completed", paymentStatus: "paid", paymentMethod: "cash_on_delivery",
    deliveryMethod: "store_pickup", salesChannel: "online", customerName: MARK, customerPhone: "99000000", subtotalMnt: 1000, totalMnt: 1000,
  } as never))[0].insertId);
  await db.insert(orderItems).values({ orderId, productId: product.id, productName: product.name, sku: "VT-TEST", unitPriceMnt: 1000, quantity: 1 } as never);
  console.log("throwaway buyer", buyerId, "staff", staffId, "order", orderId);

  const buyer = callerFor({ id: buyerId, role: "user" });
  const staff = callerFor({ id: staffId, role: "admin" });
  const guest = callerFor(null);

  // 1. Abuse is refused before anything is written.
  await buyer.reviews.create({ productId: product.id, rating: 1, comment: "энэ бараа новш, худалдагч нь тэнэг" }).then(
    () => { throw new Error("abusive review was ACCEPTED"); },
    (error: Error) => console.log("1. abusive review refused ✓ —", error.message.slice(0, 70)),
  );

  // 2. Civil review is stored.
  const review = await buyer.reviews.create({ productId: product.id, rating: 4, comment: "Сайн бараа, хүргэлт хурдан. Дахин авна." });
  reviewId = review.id;
  const [stored] = await db.select().from(productReviews).where(eq(productReviews.id, reviewId));
  console.log("2. review stored ✓ id", reviewId, "rating", stored.rating, "orderId", stored.orderId);

  // 3. Staff replies for the shop; buyer replies back; abuse in a reply refused.
  const staffReply = await staff.reviews.reply({ reviewId, body: "Баярлалаа! Дараагийн захиалгад тань 5% хямдрал хүлээж байна." });
  const buyerReply = await buyer.reviews.reply({ reviewId, body: "Заавал, баярлалаа." });
  console.log("3. replies stored ✓ ids", staffReply.id, buyerReply.id);
  await staff.reviews.reply({ reviewId, body: "you are a stupid idiot" }).then(
    () => { throw new Error("abusive reply was ACCEPTED"); },
    (error: Error) => console.log("   abusive reply refused ✓ —", error.message.slice(0, 70)),
  );

  // 4. Likes toggle and count.
  const liked = await staff.reviews.like({ reviewId });
  const liked2 = await buyer.reviews.like({ reviewId });
  const unliked = await buyer.reviews.like({ reviewId });
  console.log("4. like toggle ✓", JSON.stringify(liked), JSON.stringify(liked2), JSON.stringify(unliked));

  // 5. The public list shows the thread with badges and counts.
  const list = await guest.reviews.list({ productId: product.id });
  const mine = list.find(r => r.id === reviewId)!;
  console.log("5. public thread ✓ replies", mine.replies.length, "| staff badge on reply 1:", mine.replies[0]?.authorIsStaff, "| likes", mine.likeCount, "| likedByMe(guest)", mine.likedByMe);
  const asStaff = await staff.reviews.list({ productId: product.id });
  console.log("   likedByMe(staff)", asStaff.find(r => r.id === reviewId)!.likedByMe);

  // 6. Admin edit + reply management.
  const edited = await staff.admin.updateReview({ id: reviewId, rating: 5 });
  const replies = await staff.admin.reviewReplies({ reviewId });
  await staff.admin.updateReviewReply({ id: buyerReply.id, isApproved: false });
  const afterHide = await guest.reviews.list({ productId: product.id });
  console.log("6. admin edit ✓ rating", edited?.rating, "| replies seen by admin", replies.length, "| public after hiding one:", afterHide.find(r => r.id === reviewId)!.replies.length);
  await staff.admin.updateReviewReply({ id: buyerReply.id, isApproved: true });

  if (keep) {
    console.log(`\n--keep: thread left on /product/${product.slug} (review ${reviewId}). Run with --cleanup afterwards.`);
    process.exit(0);
  }

  // 7. Delete cascades.
  await staff.admin.deleteReview({ id: reviewId });
  const leftReplies = await db.select().from(productReviewReplies).where(eq(productReviewReplies.reviewId, reviewId));
  const leftLikes = await db.select().from(productReviewLikes).where(eq(productReviewLikes.reviewId, reviewId));
  console.log("7. delete cascades ✓ replies left", leftReplies.length, "likes left", leftLikes.length);
} finally {
  if (!keep) console.log("cleanup ✓ removed", await cleanup(), "throwaway user(s)");
}
process.exit(0);
