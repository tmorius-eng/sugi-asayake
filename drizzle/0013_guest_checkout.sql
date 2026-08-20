-- UX-RESEARCH.md priority #1: guest checkout. carts.userId was NOT NULL
-- (with a foreign key added in 0011), which forced every shopper to have an
-- account before they could even add something to a cart. This makes it
-- nullable and adds guestToken so an anonymous cart can be identified by an
-- opaque cookie value instead. orders.userId was already nullable from the
-- original schema, so no change is needed there.
--
-- IMPORTANT — apply this by hand (see 0009_independent_auth.sql for why),
-- and remove every `--> statement-breakpoint` line first (MySQL 8 does not
-- understand it).

ALTER TABLE `carts`
  MODIFY COLUMN `userId` int NULL;
--> statement-breakpoint
ALTER TABLE `carts`
  ADD COLUMN `guestToken` varchar(64) NULL AFTER `userId`;
--> statement-breakpoint
CREATE INDEX `carts_guest_token_idx` ON `carts` (`guestToken`);
