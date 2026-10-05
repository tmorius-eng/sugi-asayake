-- 2026-10-05: захиалгын үйл явдлын append-only бүртгэл (server/db/order-events.ts).
--
-- Захиалгын амьдралын мөчлөг өнөөг хүртэл ЗӨВХӨН orders мөрийн ганц ганц
-- timestamp (completedAt, returnedAt, refundedAt …) ба admin_audit_logs-ийн
-- "шинэ төлөв" метадатаас л сэргээгддэг байв. admin_audit_logs нь
-- actorUserId NOT NULL тул автомат актор (scheduler job, QPay/StorePay
-- callback, харилцагчийн өөрийн цуцлалт, систем) хэзээ ч бүртгэгддэггүй.
-- Энэ хүснэгт захиалга бичдэг ЗАМ БҮРИЙН алхмыг хэн/юу (actorKind) хийснийг
-- ижил транзакц дотор бичнэ -- /admin → Процесс самбарын эх сурвалж.
-- Зөвхөн нэмэгдэнэ: аппын код энэ хүснэгтэд UPDATE/DELETE хийдэггүй;
-- захиалга устахад л (deleteAdminOrder) FK cascade-аар дагаж устна.
-- payloadJson-д харилцагчийн нэр/утас/хаяг ХЭЗЭЭ Ч бичигдэхгүй.
CREATE TABLE `order_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `orderId` int NOT NULL,
  `kind` varchar(40) NOT NULL,
  `fromStatus` varchar(20),
  `toStatus` varchar(20),
  `actorKind` enum('customer','staff','job','webhook','system') NOT NULL,
  `actorUserId` int,
  `actorLabel` varchar(80),
  `jobName` varchar(80),
  `payloadJson` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `order_events_id` PRIMARY KEY(`id`),
  CONSTRAINT `order_events_order_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `order_events_actor_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX `order_events_order_idx` ON `order_events` (`orderId`,`id`);
--> statement-breakpoint
CREATE INDEX `order_events_kind_created_idx` ON `order_events` (`kind`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `order_events_created_idx` ON `order_events` (`createdAt`);
