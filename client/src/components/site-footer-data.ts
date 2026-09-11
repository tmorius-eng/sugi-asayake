// The footer's brand logo. A file in the repo, not a setting: it is the
// company wordmark, and swapping it is a rebrand (a design change), not
// something an admin adjusts between deploys the way a phone number is.
//
// 2026-09-12: the `footerSocials` array that used to live here moved into
// store_settings (/admin -> Дэлгүүрийн тохиргоо -> Холбоо барих) and
// SiteFooter reads it directly, so no page passes footer props any more.
export const footerLogoUrl = "/cdn/sugi-logo-transparent-clean_fee66cad.png";
