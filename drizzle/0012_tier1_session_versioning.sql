-- TIER 1: JWT sessions had no revocation mechanism at all (a 365-day static
-- token, valid until it expires no matter what). This adds a per-user
-- session version so "sign out everywhere" and a password reset can both
-- invalidate every previously issued token immediately, without moving to
-- full refresh-token rotation.
--
-- IMPORTANT — apply this by hand (see 0009_independent_auth.sql for why),
-- and remove every `--> statement-breakpoint` line first (MySQL 8 does not
-- understand it).

ALTER TABLE `users`
  ADD COLUMN `sessionVersion` int NOT NULL DEFAULT 0 AFTER `emailVerifiedAt`;
