-- Switches email verification / password reset from long random link-tokens
-- to 6-digit codes entered in-app. A code's hash is no longer guaranteed
-- globally unique (only 1e6 possible codes), so the old unique constraints
-- have to go; every lookup is scoped by userId instead. `attempts` backs a
-- per-code brute-force lockout independent of the IP rate limit.
ALTER TABLE `password_reset_tokens` DROP INDEX `password_reset_tokens_tokenHash_unique`;
ALTER TABLE `password_reset_tokens` ADD `attempts` int NOT NULL DEFAULT 0;
ALTER TABLE `email_verification_tokens` DROP INDEX `email_verification_tokens_tokenHash_unique`;
ALTER TABLE `email_verification_tokens` ADD `attempts` int NOT NULL DEFAULT 0;
