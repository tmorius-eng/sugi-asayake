export type ProductWriteCandidate = { categoryId?: number; slug?: string; sku?: string };
export type ProductConflict = { slug: string; sku: string };

export function getProductWriteViolation(input: ProductWriteCandidate, categoryFound: boolean | null, conflicts: ProductConflict[]) {
  if (input.categoryId !== undefined && !categoryFound) {
    return { code: "BAD_REQUEST" as const, message: "Select an existing product category before saving." };
  }
  if (input.slug !== undefined && conflicts.some(product => product.slug === input.slug)) {
    return { code: "CONFLICT" as const, message: "This product URL slug is already in use." };
  }
  if (input.sku !== undefined && conflicts.some(product => product.sku === input.sku)) {
    return { code: "CONFLICT" as const, message: "This product SKU is already in use." };
  }
  return null;
}

export function getCategoryWriteViolation(slug: string | undefined, conflicts: Array<{ slug: string }>) {
  if (slug !== undefined && conflicts.some(category => category.slug === slug)) {
    return { code: "CONFLICT" as const, message: "This category URL slug is already in use." };
  }
  return null;
}
