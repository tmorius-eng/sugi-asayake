export type PickableVariant = {
  id: number;
  sku: string;
  attributesJson: string | null;
  priceMnt: number;
  compareAtPriceMnt?: number | null;
  stockQuantity: number;
  imageUrl?: string | null;
  isDefault: boolean;
};

type VariantPickerProps = {
  variants: PickableVariant[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  className?: string;
};

/** "Хэмжээ: 400мл" / "Өнгө: Хар · Хэмжээ: M" — falls back to the variant's
 *  own SKU when it carries no attributesJson (shouldn't normally happen for
 *  a *second* variant, but keeps the picker from rendering a blank pill). */
export function formatVariantLabel(variant: Pick<PickableVariant, "attributesJson" | "sku">): string {
  if (variant.attributesJson) {
    try {
      const attributes = JSON.parse(variant.attributesJson) as Record<string, string>;
      const parts = Object.entries(attributes).map(([key, value]) => `${key}: ${value}`);
      if (parts.length) return parts.join(" · ");
    } catch {
      // Fall through to the sku fallback below.
    }
  }
  return variant.sku;
}

/**
 * PHASE 2 of product variants: only ever rendered when a product has more
 * than one variant (both call sites check `variants.length > 1` first) — a
 * single-variant product still looks exactly as it did before variants
 * existed, with no picker at all.
 */
export default function VariantPicker({ variants, selectedId, onSelect, className }: VariantPickerProps) {
  if (variants.length <= 1) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`} role="radiogroup" aria-label="Хувилбар сонгох">
      {variants.map(variant => {
        const active = variant.id === selectedId;
        const soldOut = variant.stockQuantity === 0;
        return (
          <button
            key={variant.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={soldOut}
            onClick={() => onSelect(variant.id)}
            className={`min-h-9 rounded-full border px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-[#df1f3d] bg-[#df1f3d] text-white" : "border-black/15 bg-white text-[#17181b] hover:border-black/35"}`}
          >
            {formatVariantLabel(variant)}{soldOut ? " — дууссан" : ""}
          </button>
        );
      })}
    </div>
  );
}
