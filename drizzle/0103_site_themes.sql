-- 2026-10-05: Брэнд студи — storefront-ийн загварууд (server/db/themes.ts).
--
-- Өмнө нь өнгө/хэлбэр зөвхөн client/src/index.css-д хатуу байсан тул сайтыг өөр
-- брэндэд шилжүүлэх, баярын үеэр загвар солих боломжгүй байв. Мөр бүр нэг загвар:
--   themeKey 'base'  — үндсэн загвар (байхгүй бол кодын BASE_THEME = index.css-ийн утгууд)
--   themeKey <баяр>  — shared/holidays.ts-ийн түлхүүр (tsagaan-sar, naadam …): асаалттай бол
--                      өөрийн цонхонд үндсэн загвар дээр давхарлана
--   бусад            — admin-ий нэмсэн загвар (kind = custom)
-- lookJson   : {light:{токен:#hex}, dark:{…}, radius, productAspect} — хэсэгчилсэн байж болно,
--              уншихдаа суурьтай нийлүүлж hex-ийг дахин шалгана (shared/theme-tokens.ts mergeLook)
-- extraJson  : мэндчилгээ, hero зургийн override, хээ, эффект г.м. (дараагийн үе шатуудад өргөжинө)
-- holidayJson: {enabled, startOffsetDays, endOffsetDays, overrideStart, overrideEnd}
CREATE TABLE `site_themes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `themeKey` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  `kind` enum('base','holiday','custom') NOT NULL DEFAULT 'custom',
  `lookJson` text NOT NULL,
  `extraJson` text,
  `holidayJson` text,
  `updatedByUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `site_themes_id` PRIMARY KEY(`id`),
  CONSTRAINT `site_themes_key_unique` UNIQUE(`themeKey`),
  CONSTRAINT `site_themes_updated_by_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
);
