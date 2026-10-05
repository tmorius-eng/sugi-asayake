-- 2026-10-05: Брэнд студийн "Түүх" — загвар хадгалах бүрийн өмнөх хувилбар (нэг товчоор буцаах).
-- Загвар бүрт сүүлийн 30 хувилбар л үлдэнэ (server/db/themes.ts saveTheme цэвэрлэнэ).
CREATE TABLE `site_theme_versions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `themeId` int NOT NULL,
  `version` int NOT NULL,
  `snapshotJson` mediumtext NOT NULL,
  `note` varchar(200),
  `createdByUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `site_theme_versions_id` PRIMARY KEY(`id`),
  CONSTRAINT `site_theme_versions_unique` UNIQUE(`themeId`,`version`),
  CONSTRAINT `site_theme_versions_theme_fk` FOREIGN KEY (`themeId`) REFERENCES `site_themes`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `site_theme_versions_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
);
