-- 2026-09-16: нэг хэрэглэгчийн купон ашиглалтын "суудал" бүрийг өвөрмөц болгох
-- жижиг дэвтэр. Шалтгаан (docs/PROJECT-GUIDE.md-ийн нээлттэй асуудал №8):
-- `discount_codes.maxUsesPerCustomer`-ийн шалгалт нь `orders`-ийг ТООЛДОГ бөгөөд
-- тоолол ба захиалгын бичилт хоёрын хооронд зай бий. Хоёр checkout яг зэрэг явбал
-- хоёул "одоогоор 0 удаа ашигласан" гэж уншаад хоёулаа хямдралыг авна. Нийт
-- `maxUses` нь атомик (UPDATE ... WHERE usesCount < maxUses) тул зөвхөн
-- нэг-хэрэглэгчийн хязгаар л ил задгай байв.
--
-- Шийдэл: (код, хэрэглэгч, дугаар) гурвалыг ӨВӨРМӨЦ индекстэй мөр болгоно.
-- Захиалгын гүйлгээний дотор дараагийн дугаарыг бичихийг оролдоно; хожигдсон
-- талын INSERT давхардлын алдаа өгч гүйлгээ бүхэлдээ буцна.
--
-- `customerKey`: нэвтэрсэн бол "u:<userId>", зочин бол "p:<утасны сүүлийн 8 цифр>"
-- — server/db.ts-ийн discountRedemptionKey()-тэй яг ижил.
--
-- Захиалга цуцлагдвал мөр устана (server/db.ts-ийн updateAdminOrder) — цуцлагдсан
-- захиалга тоологдохгүй гэсэн одоогийн дүрэмтэй ижил байхын тулд.
CREATE TABLE `discount_code_redemptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `discountCodeId` int NOT NULL,
  `customerKey` varchar(64) NOT NULL,
  `seq` int NOT NULL,
  `orderId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `discount_code_redemptions_id` PRIMARY KEY(`id`),
  CONSTRAINT `discount_code_redemptions_slot` UNIQUE(`discountCodeId`,`customerKey`,`seq`)
);
--> statement-breakpoint
CREATE INDEX `discount_code_redemptions_order_idx` ON `discount_code_redemptions` (`orderId`);
--> statement-breakpoint
ALTER TABLE `discount_code_redemptions` ADD CONSTRAINT `discount_code_redemptions_discountCodeId_discount_codes_id_fk` FOREIGN KEY (`discountCodeId`) REFERENCES `discount_codes`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Одоо байгаа, цуцлагдаагүй купонтой захиалгуудыг дэвтэрт буулгана — эс бөгөөс
-- өмнө нь кодоо ашигласан хүн шинэ "суудал" аваад хязгаарыг давах байв.
INSERT INTO `discount_code_redemptions` (`discountCodeId`, `customerKey`, `seq`, `orderId`, `createdAt`)
SELECT ranked.discountCodeId, ranked.customerKey, ranked.seq, ranked.orderId, ranked.createdAt
FROM (
  SELECT dc.id AS discountCodeId,
         CASE WHEN o.userId IS NOT NULL THEN CONCAT('u:', o.userId)
              ELSE CONCAT('p:', RIGHT(REGEXP_REPLACE(COALESCE(o.customerPhone, ''), '[^0-9]', ''), 8)) END AS customerKey,
         ROW_NUMBER() OVER (
           PARTITION BY dc.id,
             CASE WHEN o.userId IS NOT NULL THEN CONCAT('u:', o.userId)
                  ELSE CONCAT('p:', RIGHT(REGEXP_REPLACE(COALESCE(o.customerPhone, ''), '[^0-9]', ''), 8)) END
           ORDER BY o.id
         ) AS seq,
         o.id AS orderId,
         o.createdAt AS createdAt
  FROM `orders` o
  JOIN `discount_codes` dc ON dc.code = o.couponCode
  WHERE o.couponCode IS NOT NULL AND o.status <> 'cancelled'
) AS ranked;
