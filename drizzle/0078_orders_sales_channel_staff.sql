-- 2026-09-14: orders a staff member keys in for a customer who ordered by
-- phone or Messenger (admin.createManualOrder). Analytics group by this
-- column, so the channel is recorded honestly instead of pretending the
-- customer used the website.
ALTER TABLE `orders` MODIFY `salesChannel` ENUM('online','in_store','phone','messenger') NOT NULL DEFAULT 'online';
