// Admin шинэчлэл (2026-09-08, Phase C): 6 эрхийн (user/staff/finance/marketing/
// warehouse/admin) нэг хуваалцсан шошго/badge өнгөний эх сурвалж — admin
// Хэрэглэгчийн жагсаалтын badge, AdminUserDetailDrawer, sidebar/topbar footer
// ашиглана; өмнө нь газар бүрт гараар хуулсан 3 салаат ternary байсан бөгөөд
// зөвхөн user/staff/admin-ийг л хамардаг байв. Badge-ийн өнгө нь шинийг зохиохгүй
// admin KPI icon палитраас (Захиалгын ногоон, Хөрвүүлэлтийн ягаан, Дундаж сессийн
// хугацааны шар).
const ROLE_LABELS: Record<string, string> = { user: "User", staff: "Staff", finance: "Finance", marketing: "Marketing", warehouse: "Warehouse", admin: "Admin" };

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? "User";
}

// 2026-09-08: token-driven so the badges follow the admin's dark mode. These
// were the last hardcoded light chips in the panel (found by the dark-mode
// contrast audit -- six near-white pills on a dark Users list). Marketing's
// purple has no semantic token, so it keeps a literal pair that reads on both
// grounds rather than inventing a token for one badge.
const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: "bg-[var(--a-warn-soft)] text-[var(--a-warn)]",
  staff: "bg-[var(--a-info-soft)] text-[var(--a-info)]",
  finance: "bg-[var(--a-pos-soft)] text-[var(--a-pos)]",
  marketing: "bg-[color-mix(in_srgb,#8b5cf6_16%,transparent)] text-[#8b5cf6]",
  warehouse: "bg-[var(--a-warn-soft)] text-[var(--a-warn)]",
  user: "bg-[var(--a-soft)] text-[var(--a-muted)]",
};

export function roleBadgeClass(role: string): string {
  return ROLE_BADGE_CLASSES[role] ?? ROLE_BADGE_CLASSES.user;
}
