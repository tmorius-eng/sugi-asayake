-- EBARIMT.md: inert schema scaffolding only. Every column here stays at its
-- default (not_issued / NULL) until a future session wires up real receipt
-- issuance (Path A: SmartSoftware webhook, or Path B: gov POS API 3.0).
ALTER TABLE `orders` ADD `ebarimtStatus` enum('not_issued','issued','failed') NOT NULL DEFAULT 'not_issued';
ALTER TABLE `orders` ADD `ebarimtReceiptId` varchar(128);
ALTER TABLE `orders` ADD `ebarimtQrData` text;
ALTER TABLE `orders` ADD `ebarimtLotteryNumber` varchar(40);
CREATE INDEX `orders_ebarimt_status_idx` ON `orders` (`ebarimtStatus`);
