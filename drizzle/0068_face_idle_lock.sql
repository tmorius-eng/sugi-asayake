-- 2026-09-12: /admin locks itself after 25 minutes with no real interaction
-- and asks for the face again (server/faceAuth.ts, shared/face-auth.ts's
-- FACE_IDLE_TIMEOUT_MS).
--
-- The lock is recorded like any other face event, so the Security Center can
-- answer "was this screen left open?" rather than only showing failures --
-- hence one more outcome on the audit enum. Nothing existing changes meaning.
--
-- Run against Aiven via: pnpm exec tsx scripts/db-apply-migration.ts drizzle/0068_face_idle_lock.sql

ALTER TABLE `face_attempts` MODIFY `outcome` enum('enrolled','verified','no_match','liveness_failed','error','idle_locked') NOT NULL;
