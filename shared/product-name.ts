/**
 * Барааны харагдах нэр (2026-09-20, Tom: "бүх барааг монгол хэл дээрх нэр рүү
 * шилжүүл, бүгд data driven").
 *
 * Бараа хоёр нэртэй: латин `name` (POS-ийн баркод бүртгэл, захиалга, eBarimt,
 * Smart Software — гадаад системүүд үүгээр таньдаг тул ХЭЗЭЭ Ч солигдохгүй) ба
 * монгол `nameMn` (AI-аар нэг удаа үүсгэж, admin засна). Storefront дээр аль нь
 * үндсэн, аль нь дэд мөр болохыг `catalog-name-display` store setting шийднэ
 * (mn | latin) — код биш. Монгол нэргүй бараанд латин л харагдана; en/ja хэл
 * сонгосон зочинд үргэлж латин үндсэн (монгол нэр нь орчуулга биш).
 *
 * Цэвэр функц: клиент (карт, дэлгэрэнгүй, сагс, хайлтын санал), сервер (имэйл?
 * — үгүй, захиалга латин хэвээр) хоёулаа энэ нэг дүрмийг ашиглана.
 */
export type ProductNameDisplayMode = "mn" | "latin";

export type NamedProduct = { name: string; nameMn?: string | null };

export type ProductDisplayName = { primary: string; secondary: string | null };

export function parseNameDisplayMode(value: string | null | undefined): ProductNameDisplayMode {
  return value === "latin" ? "latin" : "mn";
}

export function productDisplayName(product: NamedProduct, locale: string, mode: ProductNameDisplayMode): ProductDisplayName {
  const latin = product.name.trim();
  const mn = product.nameMn?.trim() || null;
  if (!mn || mn === latin) return { primary: latin, secondary: null };
  if (locale !== "mn" || mode === "latin") return { primary: latin, secondary: mn };
  return { primary: mn, secondary: latin };
}

/** Ганц мөр хэрэгтэй газарт (aria-label, document.title, GA item_name): үндсэн нэр. */
export const productPrimaryName = (product: NamedProduct, locale: string, mode: ProductNameDisplayMode): string =>
  productDisplayName(product, locale, mode).primary;
