/**
 * Захиалгын нэхэмжлэх / баримт PDF-ээр (2026-09-13 нээлтийн аудит: "татаж авах
 * баримт байхгүй — бизнес харилцагчид хэрэгтэй").
 *
 * pdfkit-ээр санах ойд render хийгдэж tRPC-ээр (orders.invoicePdf) base64 буцаана,
 * тиймээс татаалт захиалгын бусад уншилттай ижил session шалгалтаар явна — таагдах
 * тусдаа URL байхгүй. Client байтуудыг Blob болгож хадгалалт өдөөнө.
 *
 * ШРИФТ: pdfkit-ийн built-in Helvetica кириллгүй тул мөр бүр хайрцаг болно. Golos
 * Text (сайтын өөрийн шрифт, OFL) server/assets/fonts-д байдаг, build dist/assets-
 * д хуулна. Ердийн захиалгад нэг хуудсанд багтаана; урт захиалга автоматаар хоёр
 * дахь хуудас руу урсана.
 *
 * Энэ бол БАРИМТ ("Захиалгын баримт"), eBarimt татварын баримт биш — eBarimt тусдаа
 * хуулийн баримт (EBARIMT.md) бөгөөд хэн ч андуурахгүйн тулд footer-т тэгж нэрлэсэн.
 */

import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { orderItems } from "../drizzle/schema";
import { publicOrigin } from "./_core/publicUrl";
import { getDb, getOrderById, getOrderForUser, getSiteName, getSiteTextValue, getStoreSettingValue } from "./db";

const here = path.dirname(fileURLToPath(import.meta.url));
/** dist/index.js sits next to dist/assets; in dev the source tree has server/assets. */
const FONT_CANDIDATES = [path.join(here, "assets", "fonts", "GolosText.ttf"), path.join(here, "..", "server", "assets", "fonts", "GolosText.ttf")];

/** Golos Text has no U+20AE (₮) glyph, so amounts are written "11,250 төг". */
const money = (amountMnt: number) => `${new Intl.NumberFormat("mn-MN").format(amountMnt)} төг`;

const PAYMENT_LABEL: Record<string, string> = {
  qpay: "QPay", storepay: "StorePay", bank_transfer: "Банкны шилжүүлэг", card: "Карт", cash_on_delivery: "Хүргэлтээр бэлнээр", in_store: "Дэлгүүрт",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Хүлээгдэж буй", confirmed: "Баталгаажсан", processing: "Бэлтгэж буй", shipped: "Хүргэлтэд гарсан", delivered: "Хүргэгдсэн", completed: "Дууссан", cancelled: "Цуцлагдсан", returned: "Буцаагдсан", refunded: "Буцаан олгосон",
};

export type InvoiceResult = { fileName: string; base64: string };

export async function renderOrderInvoice(orderId: number, userId: number): Promise<InvoiceResult | null> {
  const order = await getOrderForUser(orderId, userId);
  if (!order) return null;
  return renderInvoiceFor(order);
}

/** The same receipt, for staff printing it at the counter (2026-09-14). */
export async function renderOrderInvoiceForStaff(orderId: number): Promise<InvoiceResult | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  return renderInvoiceFor(order);
}

type OrderRow = NonNullable<Awaited<ReturnType<typeof getOrderById>>>;

/**
 * Packing slip (2026-09-14): what the warehouse prints to pick an order --
 * big order number, the customer's phone and delivery target, a tick box
 * per line, SKU/barcode under every name, quantities in large type, no
 * prices. One page for the typical order.
 */
export async function renderPackingSlip(orderId: number): Promise<InvoiceResult | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const items = await db.select({ productName: orderItems.productName, sku: orderItems.sku, unitPriceMnt: orderItems.unitPriceMnt, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.id);
  const siteName = await getSiteName();
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Бэлтгэх хуудас ${order.orderNumber}`, Author: siteName } });
  const font = FONT_CANDIDATES.find(existsSync);
  if (font) { doc.registerFont("body", font); doc.font("body"); }
  const chunks: Buffer[] = [];
  doc.on("data", chunk => chunks.push(chunk as Buffer));
  const done = new Promise<Buffer>(resolve => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const ink = "#17181b", muted = "#545958", line = "#c9d0ca";
  const left = doc.page.margins.left, right = doc.page.width - doc.page.margins.right;

  doc.fillColor(muted).fontSize(9).text(`${siteName} · БЭЛТГЭХ ХУУДАС`, left, 48);
  doc.fillColor(ink).fontSize(28).text(order.orderNumber, left, 62);
  doc.fontSize(10).fillColor(muted)
    .text(`Огноо: ${new Date(order.createdAt).toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar" })} · Төлөв: ${STATUS_LABEL[order.status] ?? order.status} · Төлбөр: ${PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod} (${order.paymentStatus === "paid" ? "төлсөн" : "төлөөгүй"})`, left, 100);
  doc.fillColor(ink).fontSize(11).text("Худалдан авагч", left, 128);
  doc.fillColor(muted).fontSize(11).text(`${order.customerName ?? "—"} · ${order.customerPhone ?? ""}`, left, 144);
  doc.fillColor(ink).fontSize(11).text(order.deliveryMethod === "store_pickup" ? "Салбараас авах" : "Хүргэлт", 320, 128);
  doc.fillColor(muted).fontSize(11).text(order.deliveryMethod === "store_pickup" ? (order.pickupBranch ?? "Цахим (бэлгийн карт)") : [order.deliveryDistrict, order.deliveryAddress].filter(Boolean).join(", ") || "—", 320, 144, { width: right - 320 });
  let y = 196;
  if (order.adminNote) {
    doc.fillColor(ink).fontSize(10).text("Тэмдэглэл:", left, y);
    doc.fillColor(muted).text(order.adminNote, left + 70, y, { width: right - left - 70 });
    y += Math.max(14, doc.heightOfString(order.adminNote, { width: right - left - 70 })) + 10;
  }
  doc.moveTo(left, y).lineTo(right, y).strokeColor(ink).lineWidth(1).stroke();
  y += 8;
  const col = { box: left, name: left + 30, qty: right - 70 };
  doc.fillColor(muted).fontSize(8).text("", col.box, y).text("БАРАА / БАРКОД", col.name, y).text("ТОО", col.qty, y, { width: 70, align: "right" });
  y += 16;
  for (const item of items) {
    if (y > doc.page.height - 130) { doc.addPage(); y = doc.page.margins.top; }
    doc.rect(col.box, y + 1, 14, 14).strokeColor(ink).lineWidth(1).stroke();
    doc.fillColor(ink).fontSize(12);
    const nameHeight = doc.heightOfString(item.productName, { width: col.qty - col.name - 12 });
    doc.text(item.productName, col.name, y, { width: col.qty - col.name - 12 });
    doc.fontSize(18).text(String(item.quantity), col.qty, y - 3, { width: 70, align: "right" });
    if (item.sku) doc.fillColor(muted).fontSize(10).text(item.sku, col.name, y + nameHeight + 2);
    y += Math.max(nameHeight, 14) + (item.sku ? 15 : 4) + 8;
    doc.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor(line).lineWidth(0.5).stroke();
  }
  y += 8;
  doc.fillColor(ink).fontSize(11).text(`Нийт ${items.reduce((sum, item) => sum + item.quantity, 0)} ширхэг · ${items.length} нэр төрөл`, left, y);
  const footY = doc.page.height - 90;
  doc.moveTo(left, footY).lineTo(right, footY).strokeColor(line).lineWidth(0.5).stroke();
  doc.fillColor(muted).fontSize(10).text("Бэлтгэсэн: ______________________", left, footY + 12).text("Шалгасан: ______________________", 320, footY + 12);
  doc.fontSize(8).text("Үнийн мэдээлэлгүй. Худалдан авагчийн баримт нь тусдаа (Баримт PDF).", left, footY + 40);
  doc.end();
  const pdf = await done;
  return { fileName: `packing-${order.orderNumber}.pdf`, base64: pdf.toString("base64") };
}

async function renderInvoiceFor(order: OrderRow): Promise<InvoiceResult> {
  const orderId = order.id;
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const items = await db.select({ productName: orderItems.productName, sku: orderItems.sku, unitPriceMnt: orderItems.unitPriceMnt, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.id);
  const [phone, email] = await Promise.all([getStoreSettingValue("contact-phone"), getStoreSettingValue("contact-email")]);

  // 2026-09-23: толгойн мөр тохиргооны slot-оос (`invoice-text-tagline`).
  const [siteName, tagline] = await Promise.all([getSiteName(), getSiteTextValue("invoice-text-tagline")]);
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Захиалга ${order.orderNumber}`, Author: siteName } });
  const font = FONT_CANDIDATES.find(existsSync);
  if (font) { doc.registerFont("body", font); doc.font("body"); }

  const chunks: Buffer[] = [];
  doc.on("data", chunk => chunks.push(chunk as Buffer));
  const done = new Promise<Buffer>(resolve => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const ink = "#17181b", muted = "#545958", red = "#b01729", line = "#c9d0ca";
  const left = doc.page.margins.left, right = doc.page.width - doc.page.margins.right;

  // Header
  doc.fillColor(red).fontSize(20).text(siteName, left, 48);
  doc.fillColor(muted).fontSize(9).text(tagline, left, 72);
  doc.fillColor(ink).fontSize(16).text("Захиалгын баримт", left, 100);
  doc.fontSize(10).fillColor(muted)
    .text(`Дугаар: ${order.orderNumber}`, left, 122)
    .text(`Огноо: ${new Date(order.createdAt).toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar" })}`, left, 136)
    .text(`Төлөв: ${STATUS_LABEL[order.status] ?? order.status} · Төлбөр: ${PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod} (${order.paymentStatus === "paid" ? "төлөгдсөн" : "төлөгдөөгүй"})`, left, 150);

  // Customer / delivery
  doc.fillColor(ink).fontSize(10).text("Худалдан авагч", left, 180);
  doc.fillColor(muted).text(order.customerName ?? "—", left, 194).text(order.customerPhone ?? "", left, 208);
  doc.fillColor(ink).text(order.deliveryMethod === "store_pickup" ? "Салбараас авах" : "Хүргэлт", 320, 180);
  doc.fillColor(muted).text(order.deliveryMethod === "store_pickup" ? (order.pickupBranch ?? "—") : [order.deliveryDistrict, order.deliveryAddress].filter(Boolean).join(", ") || "—", 320, 194, { width: right - 320 });

  // Items table
  let y = 248;
  // Columns (A4 = 595pt, margins 48): name 48..318, qty 330..370, unit 378..458, sum 466..547 -- no overlap even for 9-digit sums.
  const col = { name: left, qty: 330, unit: 378, sum: right - 81 };
  doc.moveTo(left, y).lineTo(right, y).strokeColor(ink).lineWidth(1).stroke();
  y += 8;
  doc.fillColor(muted).fontSize(8).text("БАРАА", col.name, y).text("ТОО", col.qty, y, { width: 40, align: "right" }).text("НЭГЖ ҮНЭ", col.unit, y, { width: 80, align: "right" }).text("ДҮН", col.sum, y, { width: 81, align: "right" });
  y += 16;
  doc.fillColor(ink).fontSize(10);
  for (const item of items) {
    if (y > doc.page.height - 160) { doc.addPage(); y = doc.page.margins.top; }
    const nameHeight = doc.heightOfString(item.productName, { width: col.qty - col.name - 12 });
    doc.text(item.productName, col.name, y, { width: col.qty - col.name - 12 });
    doc.text(String(item.quantity), col.qty, y, { width: 40, align: "right" });
    doc.text(money(item.unitPriceMnt), col.unit, y, { width: 80, align: "right" });
    doc.text(money(item.unitPriceMnt * item.quantity), col.sum, y, { width: 81, align: "right" });
    if (item.sku) doc.fillColor(muted).fontSize(8).text(item.sku, col.name, y + nameHeight + 1).fillColor(ink).fontSize(10);
    y += Math.max(nameHeight, 12) + (item.sku ? 12 : 4) + 6;
    doc.moveTo(left, y - 3).lineTo(right, y - 3).strokeColor(line).lineWidth(0.5).stroke();
  }

  // Totals
  y += 6;
  const totals: [string, number][] = [["Барааны дүн", order.subtotalMnt]];
  if (order.discountMnt) totals.push(["Хямдрал", -order.discountMnt]);
  if (order.loyaltyDiscountMnt) totals.push([`Гишүүнчлэлийн хямдрал${order.appliedLoyaltyTierName ? ` (${order.appliedLoyaltyTierName})` : ""}`, -order.loyaltyDiscountMnt]);
  if (order.couponDiscountMnt) totals.push([`Купон${order.couponCode ? ` ${order.couponCode}` : ""}`, -order.couponDiscountMnt]);
  if (order.storeCreditAppliedMnt) totals.push(["Дэлгүүрийн зээл", -order.storeCreditAppliedMnt]);
  totals.push(["Хүргэлт", order.deliveryFeeMnt]);
  for (const [label, amount] of totals) {
    doc.fillColor(muted).fontSize(10).text(label, 320, y, { width: 150 }).text(money(amount), right - 120, y, { width: 120, align: "right" });
    y += 15;
  }
  doc.moveTo(320, y).lineTo(right, y).strokeColor(ink).lineWidth(1).stroke();
  y += 6;
  doc.fillColor(ink).fontSize(13).text("Нийт", 320, y, { width: 150 }).text(money(order.totalMnt), right - 140, y, { width: 140, align: "right" });

  // Footer
  const footY = doc.page.height - 80;
  doc.moveTo(left, footY).lineTo(right, footY).strokeColor(line).lineWidth(0.5).stroke();
  doc.fillColor(muted).fontSize(8)
    .text([siteName, phone, email, publicOrigin().replace(/^https?:\/\//, "")].filter(Boolean).join(" · "), left, footY + 8)
    .text("Энэ бол захиалгын баримт бөгөөд НӨАТ-ын и-баримт (eBarimt) биш. И-баримтыг төлбөрийн дараа тусад нь олгоно.", left, footY + 20, { width: right - left });

  doc.end();
  const pdf = await done;
  return { fileName: `${order.orderNumber}.pdf`, base64: pdf.toString("base64") };
}
