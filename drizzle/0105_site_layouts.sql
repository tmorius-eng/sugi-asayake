-- 2026-10-05: Брэнд студийн "Нүүрний бүтэц" — хуудасны хэсгүүдийн дараалал, харагдах эсэх,
-- загварын хувилбар. pageKey 'home' → sectionsJson [{id, key, variant, enabled, props}].
-- Мөр байхгүй бол кодын анхдагч дараалал (client/src/pages/Home.tsx-ийн өнөөгийн дараалал).
CREATE TABLE `site_layouts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `pageKey` varchar(32) NOT NULL,
  `sectionsJson` text NOT NULL,
  `updatedByUserId` int,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `site_layouts_id` PRIMARY KEY(`id`),
  CONSTRAINT `site_layouts_page_unique` UNIQUE(`pageKey`),
  CONSTRAINT `site_layouts_updated_by_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
);
