-- 2026-10-01: купоны нэг-хэрэглэгчийн хязгаарыг checkout-ийн гүйлгээ дотор
-- `orders`-оос FOR SHARE locking read-ээр дахин тоолдог болсон (server/db/cart-orders.ts).
-- `couponCode` дээр индексгүй бол InnoDB БҮХ `orders` мөрийг S түгжээгээр уншиж,
-- өөр купонтой зэрэгцээ checkout-уудыг deadlock-д оруулж, бусад бүх захиалга
-- бичигчийг гүйлгээ дуустал хүлээлгэнэ. Индексээр зөвхөн тухайн кодын мөрүүд түгжигдэнэ.
CREATE INDEX `orders_coupon_code_idx` ON `orders` (`couponCode`);
