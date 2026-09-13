-- 2026-09-13: "Continue with Facebook" (growth tier). One Facebook account
-- maps to at most one SUGI account; the value is Meta's app-scoped user id
-- (stable per app, never the person's global id). Phone stays the login
-- identifier for everything else and may be attached later from the profile.
ALTER TABLE `users` ADD COLUMN `facebookId` varchar(64) NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_facebookId_unique` ON `users` (`facebookId`);
