-- 2026-09-05 ("remove email!!! only phone number!!!" -- Tom, explicit):
-- phone becomes the login identifier going forward. email is relaxed to
-- nullable (still unique among rows that have one) since new registrations
-- no longer collect it; phone gets a UNIQUE index since it's now what
-- auth.login/auth.register key on. Every write path that sets users.phone
-- (register, admin.updateUserPhone, attachPhoneFromVerifiedSession) already
-- normalizes to the bare 8-digit local form first, so this raw-column
-- unique index stays logically unique under findUserByPhone's
-- digits-only-right-8 comparison too.
ALTER TABLE users MODIFY email VARCHAR(320) NULL;
ALTER TABLE users ADD UNIQUE INDEX users_phone_unique (phone);
