// AdminSecurityCenter.tsx-ээс салгав (2026-09-06): шинэ admin самбарын Recent
// Activity feed admin_audit_logs.action-ийг яг ижил map-аар хүнлэг болгохын
// тулд, давхардуулахгүйгээр. Цэвэр зөөлт, AdminSecurityCenter-ийн audit-log таб
// өөрчлөгдөөгүй.
//
// server/routers.ts-ийн `logAdminAction({ ..., action: "..." })` дуудлага бүрийг
// хамарсан (таамаглаагүй, grep-ээр шууд) — хэд хэдэн шинэ action (утас сэргээх,
// онцлох брэнд, барааны variant, routine, урамшуулал, хямдралын код, маркетингийн
// зардал, site text) анхны map-д дутуу байж actionLabel-ийн `?? action`
// хамгаалалтаар түүхий мөрөөрөө гарч байв.
export const actionLabels: Record<string, string> = {
  "staff_invitation.created": "Ажилтан урьсан",
  "staff_invitation.revoked": "Урилга цуцалсан",
  "user.role_updated": "Хэрэглэгчийн эрх өөрчилсөн",
  "user.phone_updated": "Хэрэглэгчийн утас засварласан",
  "user.face_enrollment_reset": "Царайн бүртгэлийг цуцалсан",
  "user.loyalty_adjustment_updated": "Гишүүнчлэлийн урьдчилсан дүн шинэчилсэн",
  "user.suspended": "Хэрэглэгчийг түр хаасан",
  "user.unsuspended": "Хандалт сэргээсэн",
  "user.force_logout": "Бүх төхөөрөмжөөс гаргасан",
  "order.updated": "Захиалга шинэчилсэн",
  "post.created": "Пост үүсгэсэн",
  "post.updated": "Пост засварласан",
  "post.deleted": "Пост устгасан",
  "post.trashed": "Постыг хогийн санд шилжүүлсэн",
  "post.restored": "Постыг хогийн сангаас сэргээсэн",
  "post.permanentlyDeleted": "Постыг бүрмөсөн устгасан",
  "postCategory.created": "Постын ангилал үүсгэсэн",
  "media.uploaded": "Медиа файл байршуулсан",
  "product.created": "Бүтээгдэхүүн үүсгэсэн",
  "product.updated": "Бүтээгдэхүүн засварласан",
  "product.deleted": "Бүтээгдэхүүн устгасан",
  "product_variant.created": "Variant үүсгэсэн",
  "product_variant.updated": "Variant засварласан",
  "product_variant.deleted": "Variant устгасан",
  "category.created": "Ангилал үүсгэсэн",
  "category.updated": "Ангилал засварласан",
  "featuredBrand.created": "Брэнд нэмсэн",
  "featuredBrand.updated": "Брэнд засварласан",
  "featuredBrand.deleted": "Брэнд устгасан",
  "review.deleted": "Сэтгэгдэл устгасан",
  "routine.created": "Routine үүсгэсэн",
  "routine.updated": "Routine засварласан",
  "routine.deleted": "Routine устгасан",
  "routine.steps_updated": "Routine-ийн алхам шинэчилсэн",
  "promotion.created": "Урамшуулал үүсгэсэн",
  "promotion.updated": "Урамшуулал засварласан",
  "promotion.deleted": "Урамшуулал устгасан",
  "discount_code.created": "Хямдралын код үүсгэсэн",
  "discount_code.updated": "Хямдралын код засварласан",
  "discount_code.deleted": "Хямдралын код устгасан",
  "integration.updated": "Интеграцын тохиргоо шинэчилсэн",
  "marketing_spend.updated": "Зар сурталчилгааны зардал шинэчилсэн",
  "analytics.exported": "Тайлан татсан",
  "site_media.updated": "Медиа шинэчилсэн",
  "site_media.cleared": "Медиа цэвэрлэсэн",
  "site_text.updated": "Текст шинэчилсэн",
  "site_text.cleared": "Текст цэвэрлэсэн",
};

export const actionLabel = (action: string) => actionLabels[action] ?? action;
