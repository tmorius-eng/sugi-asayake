-- TIER 1: none of the 12 tables had a foreign key constraint before this —
-- referential integrity was only ever enforced at the application layer.
--
-- IMPORTANT — apply this by hand (see 0009_independent_auth.sql for why),
-- and remove every `--> statement-breakpoint` line first (MySQL 8 does not
-- understand it). Before applying, verify there are no orphaned rows, e.g.:
--   SELECT COUNT(*) FROM products p LEFT JOIN product_categories c ON p.categoryId=c.id WHERE c.id IS NULL;
-- (repeat the LEFT JOIN check for each FK below) — any non-zero count means
-- the ADD CONSTRAINT for that column will fail until the orphans are cleaned
-- up or backfilled.

ALTER TABLE `products`
  ADD CONSTRAINT `products_categoryId_product_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `product_categories`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `carts`
  ADD CONSTRAINT `carts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `cart_items`
  ADD CONSTRAINT `cart_items_cartId_carts_id_fk` FOREIGN KEY (`cartId`) REFERENCES `carts`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `cart_items`
  ADD CONSTRAINT `cart_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `order_items`
  ADD CONSTRAINT `order_items_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `order_items`
  ADD CONSTRAINT `order_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `payment_attempts`
  ADD CONSTRAINT `payment_attempts_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `posts`
  ADD CONSTRAINT `posts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `site_media`
  ADD CONSTRAINT `site_media_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `admin_audit_logs`
  ADD CONSTRAINT `admin_audit_logs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `staff_invitations`
  ADD CONSTRAINT `staff_invitations_invitedByUserId_users_id_fk` FOREIGN KEY (`invitedByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `staff_invitations`
  ADD CONSTRAINT `staff_invitations_acceptedUserId_users_id_fk` FOREIGN KEY (`acceptedUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `password_reset_tokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `email_verification_tokens`
  ADD CONSTRAINT `email_verification_tokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
