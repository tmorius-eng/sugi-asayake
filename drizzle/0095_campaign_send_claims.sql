-- 2026-09-23: кампанит ажлын давхар илгээлтийг АТОМААР хаах.
--
-- Хамгаалалт нь өмнө нь `admin_audit_logs`-оос `campaign.sent` мөрийг ХАЙЖ,
-- олдохгүй бол илгээдэг байсан (SELECT → дараа нь INSERT). Тэр нь атом биш:
-- жинхэнэ давхар товшилт ~100 мс-ийн зөрүүтэй ирэхэд хоёр хүсэлт хоёулаа
-- SELECT-ээ гүйцэтгээд хоёулаа илгээж, 2 000 хүнд 4 000 SMS (150₮ × 4 000)
-- явах боломжтой байв.
--
-- Одоо цоож нь ӨВӨРМӨЦ ИНДЕКС дээрх INSERT: хожигдсон тал давхардлын алдаа
-- авч, CONFLICT буцаана. `fingerprint` нь суваг + гарчиг + бие + хүлээн
-- авагчдын эрэмбэлсэн id-уудын sha256 (32 тэмдэгт), `windowKey` нь 10
-- минутын цонхны индекс — ингэснээр 10 минутын дараа ижил кампанит ажлыг
-- дахин илгээх боломжтой хэвээр байна.
CREATE TABLE `campaign_send_claims` (
  `id` int AUTO_INCREMENT NOT NULL,
  `fingerprint` varchar(64) NOT NULL,
  `windowKey` varchar(32) NOT NULL,
  `actorUserId` int NOT NULL,
  `channel` varchar(20) NOT NULL,
  `recipientCount` int NOT NULL DEFAULT 0,
  `createdAt` timestamp DEFAULT (now()) NOT NULL,
  CONSTRAINT `campaign_send_claims_id` PRIMARY KEY(`id`),
  CONSTRAINT `campaign_send_claims_unique` UNIQUE(`fingerprint`,`windowKey`)
);
--> statement-breakpoint
CREATE INDEX `campaign_send_claims_created_idx` ON `campaign_send_claims` (`createdAt`);
