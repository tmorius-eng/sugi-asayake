// Extracted from AdminSecurityCenter.tsx (2026-09-06) so the new admin
// dashboard's Recent Activity feed can humanize admin_audit_logs.action
// through the exact same map, rather than duplicating it. Pure move, no
// behavior change to AdminSecurityCenter's own audit-log tab.
//
// Expanded to cover every `logAdminAction({ ..., action: "..." })` call
// site in server/routers.ts (grepped directly, not guessed) -- several
// newer actions (phone recovery, featured brands, product variants,
// routines, promotions, discount codes, marketing spend, site text) were
// missing from the original map and silently fell back to the raw action
// string via actionLabel's own `?? action` safety net.
export const actionLabels: Record<string, string> = {
  "staff_invitation.created": "Ажилтан урьсан",
  "staff_invitation.revoked": "Урилга цуцалсан",
  "user.role_updated": "Хэрэглэгчийн эрх өөрчилсөн",
  "user.phone_updated": "Хэрэглэгчийн утас засварласан",
  "user.loyalty_adjustment_updated": "Гишүүнчлэлийн урьдчилсан дүн шинэчилсэн",
  "user.suspended": "Хэрэглэгчийг түр хаасан",
  "user.unsuspended": "Хандалт сэргээсэн",
  "user.force_logout": "Бүх төхөөрөмжөөс гаргасан",
  "order.updated": "Захиалга шинэчилсэн",
  "post.created": "Пост үүсгэсэн",
  "post.updated": "Пост засварласан",
  "post.deleted": "Пост устгасан",
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
