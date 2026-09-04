// 2026-09-04 cohesion audit: this exact function (or a near-identical
// template-literal/string-concat variant) was independently copy-pasted into
// 23 separate files (client pages, client admin components, and 2 server
// files) rather than shared once -- a textbook symptom of features being
// built page-by-page instead of against a common primitive. One export here,
// imported everywhere via `@shared/format` (works from both client and
// server, same as `@shared/catalog-filter` etc. already do).
export const formatMnt = (amountMnt: number) => `${new Intl.NumberFormat("mn-MN").format(amountMnt)}₮`;
