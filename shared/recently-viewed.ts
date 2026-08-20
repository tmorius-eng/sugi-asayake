export type RecentProduct = { id: number };

/** Keep recent browsing on the device only; no customer identity or activity is sent to the server. */
export function rememberRecentlyViewed(ids: number[], productId: number, limit = 6) {
  return [productId, ...ids.filter(id => id !== productId)].slice(0, limit);
}

export function resolveRecentlyViewed<T extends RecentProduct>(products: T[], ids: number[]) {
  const productById = new Map(products.map(product => [product.id, product]));
  return ids.map(id => productById.get(id)).filter((product): product is T => Boolean(product));
}

export function countUnavailableRecentlyViewed<T extends RecentProduct>(products: T[], ids: number[]) {
  return Math.max(0, ids.length - resolveRecentlyViewed(products, ids).length);
}
