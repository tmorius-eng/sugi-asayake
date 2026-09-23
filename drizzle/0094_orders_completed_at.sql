-- 2026-09-23: захиалга "дууссан" болсон яг тэр мөчийг тусдаа баганад бичнэ.
--
-- Яагаад: буцаалтын хүсэлтийн цонх (`requestOrderReturn`, 14 хоног) болон
-- сэтгэгдэл хүсэх ажил (`getOrdersNeedingReviewRequest`) хоёулаа `orders.updatedAt`-ыг
-- "дууссан хугацаа" гэж үздэг байсан. Гэвч схемд тэр багана `.onUpdateNow()`-той
-- тул MySQL ЯМАР Ч UPDATE дээр түүнийг шинэчилдэг — `markReviewRequested`
-- (`reviewRequestedAt` л бичдэг), админы тэмдэглэлийн засвар, хүргэлтийн
-- дугаар нэмэх гэх мэт. Үр дүн: сэтгэгдэл хүсэх ажил 7 дахь өдөр ажиллавал
-- `updatedAt` тэр өдөр болж, худалдан авагч 20 дахь өдөр ч буцаалт хүсэх
-- боломжтой болдог байв.
--
-- Хуучин мөрүүдэд `updatedAt`-аар нөхнө: бүрэн зөв биш ч одоо байгаа
-- логикоос дор биш, шинэ мөрүүд яг мөчөөрөө бичигдэнэ.
ALTER TABLE `orders` ADD COLUMN `completedAt` timestamp NULL;
--> statement-breakpoint
UPDATE `orders` SET `completedAt` = `updatedAt` WHERE `status` = 'completed' AND `completedAt` IS NULL;
