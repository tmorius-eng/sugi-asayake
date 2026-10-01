-- 2026-10-01: аюулгүй байдлын scan (A+B бүлэг).
--
-- 1) session_revocations: нэг төхөөрөмжийн logout. Сешн JWT одоо `jti`-тай;
--    logout нь тэр jti-г энд бичнэ, resolveUserFromToken шалгана. Бусад
--    төхөөрөмж (sessionVersion) хөндөгдөхгүй. expiresAt = токены хугацаа дуусах
--    агшин -- түүнээс хойш мөр хэрэггүй тул retention job устгана.
CREATE TABLE `session_revocations` (
  `jti` varchar(32) NOT NULL,
  `userId` int NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `session_revocations_jti` PRIMARY KEY(`jti`)
);
--> statement-breakpoint
CREATE INDEX `session_revocations_expiry_idx` ON `session_revocations` (`expiresAt`);
--> statement-breakpoint
CREATE INDEX `session_revocations_user_idx` ON `session_revocations` (`userId`);
--> statement-breakpoint
-- 2) faceGrantVersion: царайны proof / нууц үгийн step-up JWT-д `fgv` claim.
--    Lock, царайны дахин бүртгэл, step-up зарцуулалт, амжилттай царай бүрт өсч,
--    хуучин proof-ийг (cookie хуулсан ч) хүчингүй болгоно.
ALTER TABLE `users` ADD COLUMN `faceGrantVersion` int NOT NULL DEFAULT 0;
