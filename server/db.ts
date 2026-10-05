/**
 * server/db.ts — BARREL (2026-09-21). Өмнө нь 7 066 мөрийн нэг файл байсан; одоо
 * server/db/<домэйн>.ts-үүд, энэ файл бүгдийг re-export хийдэг тул `import { … } from "./db"`
 * хэвээр ажиллана. Шинэ функц бичихдээ тохирох домэйн файлд нь нэм; шинэ файл үүсгэвэл
 * энд мөр нэм. (docs/CODEBASE.md §3)
 */
export * from "./db/connection"; // Холболт, pool, getDb/dbPing; борлуулалтын SQL нөхцөл (settledSaleSql), захиалгын дугаар
export * from "./db/users"; // Хэрэглэгч, session, хаяг, хүслийн жагсаалт, утасны баталгаажуулалт/бүртгэл, Facebook
export * from "./db/catalog"; // Storefront каталог: жагсаалт, хайлт, санал болголт, холбоотой бараа, slug/sku
export * from "./db/cart-orders"; // Сагс, сагснаас захиалга, дэлгүүрийн борлуулалт (POS)
export * from "./db/routines-promotions"; // Routine (арчилгааны багц) ба зарын урамшуулал
export * from "./db/customer-orders"; // Харилцагчийн өөрийн захиалга: жагсаалт, цуцлах
export * from "./db/reviews"; // Сэтгэгдэл, хариулт, like, moderation, эрх
export * from "./db/payments"; // QPay/StorePay төлбөрийн оролдлого
export * from "./db/admin-orders"; // Admin: бараа/захиалгын жагсаалт, самбар, нөөц хасах/буцаах, гар захиалга, засвар, буцаалт, устгал, хянах
export * from "./db/posts"; // Нийтлэл, ангилал/tag, медиа сан
export * from "./db/site"; // Онцлох брэнд, салбар, storefront кэш, site media/text/documents, ажлын байр, гишүүнчлэлийн зэрэглэл
export * from "./db/ops"; // Ангилал (public), дэлгүүрийн тохиргоо, хуваарьт ажил, орхигдсон сагс, дэлгүүрийн зээл, маркетингийн зардал, зочны session, аудит, нэвтрэлтийн оролдлого
export * from "./db/admin-catalog"; // Admin: ангилал/бараа бичих, зөрчил шалгах
export * from "./db/customers"; // Admin: хэрэглэгчийн жагсаалт/дэлгэрэнгүй, гишүүнчлэлийн төлөв, түр хаах, эрх, утас
export * from "./db/discounts"; // Хямдралын код
export * from "./db/integrations"; // Интеграцийн тохиргоо (шифрлэгдсэн)
export * from "./db/notifications"; // Мэдэгдлийн outbox/feed, push subscription
export * from "./db/variants"; // Барааны хувилбар (variant) ба салбарын нөөц
export * from "./db/face"; // Admin царайны бүртгэл/challenge/оролдлого
export * from "./db/questions"; // Асуулт, хариулт
export * from "./db/gift-cards"; // Бэлгийн карт
export * from "./db/price-campaigns"; // Бүх барааны нийтийн хямдрал (2026-09-29)
export * from "./db/order-events"; // Захиалгын үйл явдлын append-only бүртгэл — /admin → Процесс (2026-10-05)
