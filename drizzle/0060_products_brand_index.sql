-- 2026-09-11 audit: products.brand carried no index, yet it is the join key
-- for three hot paths added over the last two days --
--   1. getBestsellingProducts' featured-brand filler  (featured_brands.brandName = products.brand)
--   2. getFeaturedBrands' photo fallback              (WHERE brand IN (...))
--   3. getDistinctRealBrands for the admin dropdown   (GROUP BY brand)
-- At 937 rows a full scan is cheap; it stops being cheap as the catalogue
-- grows, and #1 now runs on every homepage render.
CREATE INDEX `products_brand_idx` ON `products` (`brand`);
