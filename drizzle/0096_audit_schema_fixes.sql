-- 2026-09-27 бүтэн-стек аудит (docs/AUDIT-2026-09-27-final.md §E).
--
-- E1: нийтлэл/хуулийн баримт TEXT (64 KB) байсан ч zod 200 000 тэмдэгт
--     зөвшөөрдөг — кирилл utf8mb4-д 2 байт + TinyMCE-ийн markup тул ~25 000
--     тэмдэгтийн нийтлэл хадгалагдахгүй (strict mode "Data too long").
ALTER TABLE `posts` MODIFY `content` MEDIUMTEXT NOT NULL;
--> statement-breakpoint
ALTER TABLE `site_documents` MODIFY `contentHtml` MEDIUMTEXT NOT NULL;
--> statement-breakpoint
-- E2: зэрэглэлийн нэр 60 тэмдэгт хүртэл засагддаг, захиалгын хуулбар нь 40 —
--     урт нэртэй зэрэглэлийн харилцагч бүрийн checkout унадаг байв.
ALTER TABLE `orders` MODIFY `appliedLoyaltyTierName` VARCHAR(60) NULL;
--> statement-breakpoint
-- E5: салбарын нэр 160, захиалгын `pickupBranch` 120 байсан.
ALTER TABLE `orders` MODIFY `pickupBranch` VARCHAR(160) NULL;
--> statement-breakpoint
-- E13: DB-д `DEFAULT ''` үлдсэн байв — нууц үггүй INSERT хоосон hash-тэй амжилттай болох.
ALTER TABLE `users` ALTER `passwordHash` DROP DEFAULT;
--> statement-breakpoint
-- E15: халуун query-ийн индекс (орхигдсон сагсны job, analytics, back-in-stock job).
CREATE INDEX `carts_status_updated_idx` ON `carts` (`status`, `updatedAt`);
--> statement-breakpoint
CREATE INDEX `orders_payment_status_created_idx` ON `orders` (`paymentStatus`, `status`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `wishlist_items_restock_idx` ON `wishlist_items` (`notifyOnRestock`, `restockNotifiedAt`);
