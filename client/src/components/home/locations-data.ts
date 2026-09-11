// This file used to hold the branch list (name/address/phone/mapUrl) as a
// hardcoded array; those moved into the `branches` table on 2026-09-08 and
// are edited in /admin -> Салбарууд.
//
// 2026-09-12: the last constant here, BRANCH_HOURS, moved too -- it is now
// the `contact-branch-hours` store setting (/admin -> Дэлгүүрийн тохиргоо
// -> Холбоо барих), read via useShopContact(). Nothing about the shop's
// real-world operation is hardcoded any more, so this file is intentionally
// left empty rather than deleted: its name appears in several explanatory
// comments across the homepage components, and an empty file with this note
// is a better landing place for that trail than a broken path.
export {};
