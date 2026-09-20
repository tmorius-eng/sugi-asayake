-- 2026-09-20: хайлтын синонимын толь кодоос DB руу (Tom: "бүгдийг data driven,
-- admin хэсгээс editable болго").
--
-- Өмнө нь shared/search-synonyms.ts-ийн 149 бүлэг хатуу бичигдсэн тул шинэ үг
-- нэмэх бүрт код deploy хэрэгтэй байв. Одоо мөр бүр нэг ОЙЛГОЛТ: `concept` нь
-- тогтвортой түлхүүр (бүлгийн эхний үг), `terms` нь тэр ойлголтыг илэрхийлэх
-- бүх үг таслалаар (монгол бичлэгүүд, галиг, барааны нэрэнд байдаг англи үг).
-- Кодын жагсаалт seed болж үлдэнэ (scripts/seed-search-dictionaries.ts).
-- Admin → Хайлт → Синонимын толь. Хадгалмагц хайлтын индекс дахин баригдана.
CREATE TABLE `search_synonyms` (
  `id` int AUTO_INCREMENT NOT NULL,
  `concept` varchar(80) NOT NULL,
  `terms` text NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `search_synonyms_id` PRIMARY KEY(`id`),
  CONSTRAINT `search_synonyms_concept_unique` UNIQUE(`concept`)
);
