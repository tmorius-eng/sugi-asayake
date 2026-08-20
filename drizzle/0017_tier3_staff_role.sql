-- TIER 3: a third role, `staff`, between `user` and `admin` — can manage
-- storefront operations (products, categories, orders, posts, media) but not
-- user accounts/roles or financial figures. Enforced in
-- server/_core/trpc.ts (staffProcedure vs adminProcedure).
ALTER TABLE `users` MODIFY `role` enum('user','staff','admin') NOT NULL DEFAULT 'user';
ALTER TABLE `staff_invitations` MODIFY `role` enum('user','staff','admin') NOT NULL DEFAULT 'user';
