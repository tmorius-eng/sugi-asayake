-- 2026-09-16: камергүй компьютер дээр admin-д нэвтрэх "handoff" хүсэлтүүд.
-- Бүрэн дизайн, аюулгүй байдлын үндэслэл: docs/FACE-HANDOFF-PLAN.md.
--
-- Урсгал: компьютер QR үүсгэнэ -> утас уншаад юуг баталж байгаагаа хараад,
-- компьютер дээр гарсан ТООГ таарууулж, царайгаа уншуулна -> компьютер өөрөө
-- асууж байгаад өөрийнх нь хүсэлт дээр proof cookie-гоо авна.
--
-- ⚠️ `tokenHash`: түүхий token-ийг ХЭЗЭЭ Ч хадгалахгүй (sha256 hex). DB-г
-- уншсан хүн ямар ч хүлээгдэж буй handoff-ийг баталж чадахгүй байх ёстой.
-- ⚠️ `adminTabId`: proof яг тэр табд л очно — таб бүрийн заавал шаардлага
-- (server/_core/faceProof.ts) handoff-оор ч тойрогдохгүй.
-- ⚠️ `sessionVersion`: нууц үг солих / бүх төхөөрөмжөөс гарах үед хүлээгдэж
-- буй handoff автоматаар үхнэ.
CREATE TABLE `face_handoff_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `sessionVersion` int NOT NULL,
  `adminTabId` varchar(64) NOT NULL,
  `matchNumber` int NOT NULL,
  `desktopIp` varchar(64),
  `desktopAgent` varchar(200),
  `status` enum('pending','approved','used','denied','expired') NOT NULL DEFAULT 'pending',
  `approvedByIp` varchar(64),
  `approvedAt` timestamp NULL,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `face_handoff_requests_id` PRIMARY KEY(`id`),
  CONSTRAINT `face_handoff_requests_token` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `face_handoff_requests_user_idx` ON `face_handoff_requests` (`userId`,`status`);
--> statement-breakpoint
CREATE INDEX `face_handoff_requests_expiry_idx` ON `face_handoff_requests` (`expiresAt`);
--> statement-breakpoint
ALTER TABLE `face_handoff_requests` ADD CONSTRAINT `face_handoff_requests_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
