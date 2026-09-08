// Admin overhaul (2026-09-08, Phase C): one shared label/badge-color source
// for the 6 roles (user/staff/finance/marketing/warehouse/admin), reused by
// the admin Users list badge, AdminUserDetailDrawer, and the sidebar/topbar
// footer -- previously a 3-way ternary hand-copied in each of those places,
// which only ever covered user/staff/admin. Badge colors reuse this
// codebase's own existing AdminStatCard icon palette (Захиалга's green,
// Хөрвүүлэлт's purple, Дундаж сессийн хугацаа's amber) rather than
// inventing new ones.
const ROLE_LABELS: Record<string, string> = { user: "User", staff: "Staff", finance: "Finance", marketing: "Marketing", warehouse: "Warehouse", admin: "Admin" };

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? "User";
}

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: "bg-[#fff0d2] text-[#9b6417]",
  staff: "bg-[#e6f0fb] text-[#2c5a91]",
  finance: "bg-[#eaf5ef] text-[#2c7650]",
  marketing: "bg-[#f5eefb] text-[#6b4fa0]",
  warehouse: "bg-[#fff4e5] text-[#c67c1f]",
  user: "bg-[#edf0f5] text-[#505d70]",
};

export function roleBadgeClass(role: string): string {
  return ROLE_BADGE_CLASSES[role] ?? ROLE_BADGE_CLASSES.user;
}
