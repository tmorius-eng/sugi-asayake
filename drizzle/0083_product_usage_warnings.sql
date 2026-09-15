-- 2026-09-15: the two label fields Smart Retail's product feed carries that
-- 0079 had no home for. Their /api/inventory/products returns `instructions`
-- and `termsOfUse` (both answer "how do I use this") plus `warning`, next to
-- the `ingredients` we already store -- so a shop that keeps its labels in
-- the POS can fill these for the whole catalogue instead of retyping them.
--
-- Nullable, like every other facts column, and written only through the
-- vendor diff screen, which never touches a product whose factsSource is
-- "admin" (a person edited it; the sync does not get to overwrite that).
ALTER TABLE `products`
  ADD COLUMN `usageInstructions` TEXT NULL AFTER `ingredients`,
  ADD COLUMN `warnings` TEXT NULL AFTER `usageInstructions`;
