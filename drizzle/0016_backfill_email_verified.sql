-- auth.login now requires emailVerifiedAt (see server/routers.ts) so that a
-- registration can't be finished by just logging in instead of entering the
-- emailed code. Grandfather every account that existed before this flow
-- shipped — none of them ever verified under the old (optional, non-blocking)
-- email verification, and blocking them now would lock out real users
-- (including the store owner's own account) for a requirement that didn't
-- exist when they signed up.
UPDATE `users` SET `emailVerifiedAt` = `createdAt` WHERE `emailVerifiedAt` IS NULL;
