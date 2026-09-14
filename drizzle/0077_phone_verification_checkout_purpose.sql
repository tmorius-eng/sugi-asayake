-- 2026-09-14: guest checkout phone verification. A shopper without an
-- account (or with an account that has no verified phone, e.g. one created
-- through Facebook login) proves the number they type at checkout by the
-- same verify.mn Mobile-Originated SMS the registration step uses. Stops
-- fake cash-on-delivery orders placed under someone else's number.
ALTER TABLE `phone_verification_sessions` MODIFY `purpose` ENUM('register','password_reset','checkout') NOT NULL;
