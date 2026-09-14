/**
 * Gift cards sold at checkout (2026-09-14): telling the buyer their codes.
 *
 * issueGiftCardsForPaidOrder (server/db.ts) mints the cards inside the
 * transaction that marks the order paid; this runs after that commit and
 * only carries the news -- a Web Push to the buyer's browsers (if they are
 * signed in and subscribed) and an email (if they gave one). Failing here
 * loses nothing: the codes are on the order in the profile and in the
 * guest's order tracking either way.
 */
import { formatMnt } from "../shared/format";
import { GIFT_CARD_VALIDITY_MONTHS } from "../shared/gift-cards";
import { sendAccountEmail } from "./_core/notification";
import { sendPushToUser } from "./_core/webPush";
import { getOrderById, type IssuedGiftCard } from "./db";

export async function deliverIssuedGiftCards(orderId: number, cards: IssuedGiftCard[]): Promise<void> {
  if (!cards.length) return;
  const order = await getOrderById(orderId);
  if (!order) return;
  const total = cards.reduce((sum, card) => sum + card.amountMnt, 0);
  const lines = cards.map(card => `${card.code} — ${formatMnt(card.amountMnt)}`).join("\n");
  if (order.userId) {
    await sendPushToUser(order.userId, {
      title: "Таны бэлгийн карт бэлэн боллоо",
      body: cards.length === 1 ? `${cards[0].code} · ${formatMnt(cards[0].amountMnt)}` : `${cards.length} карт · нийт ${formatMnt(total)}. Кодуудыг профайлаас харна уу.`,
      url: "/profile?tab=orders",
      tag: `gift-cards-${orderId}`,
    }).catch(error => console.warn("[gift-cards] push failed", error instanceof Error ? error.message : error));
  }
  if (order.customerEmail) {
    await sendAccountEmail({
      to: order.customerEmail,
      subject: `SUGI ASAYAKE бэлгийн карт — захиалга ${order.orderNumber}`,
      content: `Сайн байна уу, ${order.customerName}!\n\nТаны ${order.orderNumber} дугаартай захиалгын төлбөр баталгаажиж, бэлгийн карт${cards.length > 1 ? "ууд" : ""} бэлэн боллоо:\n\n${lines}\n\nКодыг хүлээн авагч /profile → Гишүүнчлэл → "Бэлгийн карт ашиглах" хэсэгт оруулахад дүн нь дэлгүүрийн зээл болж, дараагийн захиалгаас хасагдана. Хүчинтэй хугацаа: ${GIFT_CARD_VALIDITY_MONTHS} сар.\n\nSUGI ASAYAKE`,
    }).catch(error => console.warn("[gift-cards] email failed", error instanceof Error ? error.message : error));
  }
}
