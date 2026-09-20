-- 2026-09-20: санал болголт v3 — биеийн арчилгааны профайл + олон утгат арьсны төрөл.
--
-- Tom: "профайл дээр арьс, үс, бие сонгосон ч санал болгож буй бараа буруу".
-- Шалтгаан (хэмжсэн): products.skinType ганц утга (чийгшүүлэгч нь хуурай+хэвийн+
-- хосолсон бүгдэд тохирдог ч нэгийг л авдаг) ба 561 мөр auto-tag-ийн "normal"
-- placeholder; "бие" гэсэн алхам огт байгаагүй.
--
--  users.bodySkinType / bodyConcerns     — асуулгын шинэ "Биеийн арчилгаа" алхам
--  products.bodySkinType / bodyConcerns  — барааны толь (ижил vocabulary)
--  products.skinTypes                     — таслалаар олон утга ("dry,normal,combination"
--                                           эсвэл "all"); хуучин skinType хэвээр үлдэнэ.
-- Backfill: бодит (placeholder биш) skinType-ийг skinTypes руу хуулна. auto-tag-ийн
-- 2-р шатны "normal" (skinConcerns-гүй) placeholder-ийг ХУУЛАХГҮЙ — tagger v2
-- (scripts/auto-tag-products.ts) дахин бөглөнө.
ALTER TABLE `users` ADD COLUMN `bodySkinType` enum('dry','normal','sensitive');
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `bodyConcerns` varchar(300);
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `bodySkinType` enum('dry','normal','sensitive');
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `bodyConcerns` varchar(300);
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `skinTypes` varchar(80);
--> statement-breakpoint
UPDATE `products` SET `skinTypes` = `skinType` WHERE `skinType` IS NOT NULL AND NOT (`skinType` = 'normal' AND `skinConcerns` IS NULL);
