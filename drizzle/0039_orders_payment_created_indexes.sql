-- Backend audit (2026-09-02): orders.paymentStatus is queried via
-- eq(orders.paymentStatus, "paid") in getBestsellingProducts,
-- getRecommendedProducts, and the admin dashboard summary; orders.createdAt
-- is used in ORDER BY desc(orders.createdAt) in getAdminOrders and the admin
-- dashboard's recent-orders list. Neither had an index (only userId/status/
-- ebarimtStatus did). Invisible at today's ~4 real orders; cheap insurance
-- before order volume grows enough for it to matter.
CREATE INDEX `orders_payment_status_idx` ON `orders` (`paymentStatus`);
CREATE INDEX `orders_created_at_idx` ON `orders` (`createdAt`);
