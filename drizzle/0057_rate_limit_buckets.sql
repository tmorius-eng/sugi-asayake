-- Audit 2026-09-09 (R3): shared counters for the STRICT rate-limit tiers.
--
-- Every rate limit used to live in a per-process Map (server/_core/
-- security.ts). That is fine for the high-volume general/cart tiers, but the
-- strict tiers -- login, register, password reset, checkout, phone
-- verification (each SMS costs the end user 150₮) -- are exactly the
-- brute-force/abuse targets whose limit must hold across every server
-- instance, which a Map cannot do the moment the app runs on more than one
-- process (multi-instance host, serverless, a rolling restart). This table
-- is the shared counter: one atomic INSERT ... ON DUPLICATE KEY UPDATE per
-- attempt, expired rows swept opportunistically.
CREATE TABLE `rate_limit_buckets` (
  `bucketKey` varchar(200) NOT NULL,
  `count` int NOT NULL DEFAULT 1,
  `resetAt` timestamp NOT NULL,
  PRIMARY KEY (`bucketKey`),
  INDEX `rate_limit_buckets_reset_idx` (`resetAt`)
);
