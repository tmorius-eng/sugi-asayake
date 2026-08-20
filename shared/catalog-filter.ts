export type CatalogSearchItem = {
  categoryName?: string | null;
  name: string;
  brand?: string | null;
  shortDescription?: string | null;
};

export type CatalogDiscoveryItem = CatalogSearchItem & {
  priceMnt: number;
  stockQuantity: number;
};

export type CatalogSortOption = "featured" | "price-low" | "price-high" | "name-asc";

export function getCatalogCategories<T extends CatalogSearchItem>(products: T[]) {
  return Array.from(new Set(products.map(product => product.categoryName).filter((category): category is string => Boolean(category))));
}

export function filterCatalogProducts<T extends CatalogSearchItem>(products: T[], search: string, category: string) {
  const needle = search.trim().toLocaleLowerCase();
  return products.filter(product => {
    const matchesCategory = category === "all" || product.categoryName === category;
    const searchable = [product.name, product.brand, product.shortDescription, product.categoryName].filter(Boolean).join(" ").toLocaleLowerCase();
    return matchesCategory && (!needle || searchable.includes(needle));
  });
}

export function filterCatalogStock<T extends CatalogDiscoveryItem>(products: T[], inStockOnly: boolean) {
  return inStockOnly ? products.filter(product => product.stockQuantity > 0) : products;
}

export function sortCatalogProducts<T extends CatalogDiscoveryItem>(products: T[], sort: CatalogSortOption) {
  const copy = [...products];
  if (sort === "price-low") return copy.sort((a, b) => a.priceMnt - b.priceMnt);
  if (sort === "price-high") return copy.sort((a, b) => b.priceMnt - a.priceMnt);
  if (sort === "name-asc") return copy.sort((a, b) => a.name.localeCompare(b.name, "mn"));
  return copy;
}
