-- 2026-09-14: (a) the post-delivery review request -- once per completed
-- order, sent by the review-request job a few days after completion;
-- (b) the customer's own return request from the profile, which staff then
-- turn into the existing returned -> refund flow.
ALTER TABLE `orders`
  ADD COLUMN `reviewRequestedAt` TIMESTAMP NULL AFTER `refundNote`,
  ADD COLUMN `returnRequestedAt` TIMESTAMP NULL AFTER `reviewRequestedAt`,
  ADD COLUMN `returnRequestReason` VARCHAR(500) NULL AFTER `returnRequestedAt`;
