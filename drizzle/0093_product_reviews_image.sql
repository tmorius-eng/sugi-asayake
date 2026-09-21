-- 2026-09-21: сэтгэгдэлд нэг зураг (худалдан авагчийн өөрийн авсан).
--
-- `reviews.uploadImage` (server/routers.ts): зөвхөн тухайн бараанд сэтгэгдэл
-- бичих эрхтэй хэрэглэгч, файлын гарын үсэг шалгана, nudity screen
-- (classifyImageSafety), WebP + 600w + AVIF хувилбар `reviews/<userId>/…` доор.
-- `reviews.create` нь зөвхөн тухайн хэрэглэгчийн өөрийн upload-ыг хүлээн авна.
-- Admin → Сэтгэгдэл дээр зураг харагдаж, "Зураг хасах" (imageUrl = NULL) боломжтой;
-- сэтгэгдлийг нуувал зураг ч хамт нуугдана (нийтийн жагсаалтад ордоггүй).
ALTER TABLE `product_reviews` ADD COLUMN `imageUrl` text NULL;
