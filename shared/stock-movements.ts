/**
 * Нөөцийн ledger-ийн хөдөлгөөний төрлийн монгол шошго (2026-09-11, drizzle/schema.ts-
 * ийн stockMovements). Admin түүхийн жагсаалт, дараагийн ямар ч export ижил зүйл
 * хэлэхийн тулд хуваалцсан.
 */
export const STOCK_MOVEMENT_LABELS: Record<string, string> = {
  opening: "Эхний үлдэгдэл",
  sale_online: "Онлайн борлуулалт",
  sale_pos: "Дэлгүүрийн касс",
  order_restock: "Цуцлагдсан захиалга — буцаж орсон",
  refund_restock: "Буцаалт — нөөцөд орсон",
  admin_set: "Гараар засав",
  product_form_set: "Бүтээгдэхүүний маягтаас засав",
  variant_seed: "Шинэ барааны эхний үлдэгдэл",
  receipt: "Бараа хүлээн авсан",
  transfer_out: "Шилжүүлэг — гарсан",
  transfer_in: "Шилжүүлэг — орсон",
  transfer_return: "Шилжүүлэг цуцлагдаж буцсан",
  transfer_writeoff: "Шилжүүлгийн дутагдал — хассан",
  count_adjust: "Тооллогын зөрүү",
  rebaseline: "Ledger тааруулга",
};

export const stockMovementLabel = (type: string) => STOCK_MOVEMENT_LABELS[type] ?? type;
