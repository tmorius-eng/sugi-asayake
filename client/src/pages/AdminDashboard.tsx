import { LoaderCircle, LogIn } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import AdminWorkspace from "@/components/AdminWorkspace";
import AdminFaceGate from "@/components/AdminFaceGate";

/**
 * Tom, 2026-09-05 (explicit): this page used to wrap AdminWorkspace (the
 * real "COMMERCE ADMIN" panel, with its own full section sidebar) in
 * DashboardLayout -- a second, entirely separate "SUGI CONTROL" sidebar
 * shell with just 4 generic links, 2 of which ("Удирдлага"/"Бүтээгдэхүүн")
 * already duplicated sections AdminWorkspace's own sidebar already had.
 * DashboardLayout was leftover starter-template scaffolding (its own
 * defaultMenuItems literally say "Page 1"/"Page 2") that never got removed
 * once AdminWorkspace grew into a real, complete admin UI -- "sugi control
 * doesn't do anything" was an accurate read of it. Merged into ONE sidebar
 * (AdminWorkspace's own -- see its "Нүүр хуудас"/"Гарах" footer addition);
 * this page now only handles the 3 auth states DashboardLayout used to
 * gate on (loading / not signed in / signed in without access), which
 * AdminWorkspace itself never handled.
 */
// Admin overhaul (2026-09-08, Phase C): widened from 2 roles to 6 -- found
// via actual Playwright login as a throwaway "finance" account, which hit
// this exact gate and got bounced to the "Админ эрх шаардлагатай" screen
// even though finance is a legitimate admin-panel role now. This route
// guard is upstream of AdminWorkspace's own much finer-grained per-section
// visibility (client/src/components/admin/AdminSidebar.tsx's SECTION_ROLES)
// -- it only needs to answer "does this role belong in the admin panel at
// all", which is just "not a plain customer".
const ADMIN_PANEL_ROLES = new Set(["staff", "finance", "marketing", "warehouse", "admin"]);

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const hasAccess = Boolean(user?.role && ADMIN_PANEL_ROLES.has(user.role));

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#f8f5ef]"><LoaderCircle className="animate-spin text-[#df1f3d]" size={28} aria-label="Ачаалж байна" /></div>;
  }

  if (!user) {
    return <div className="grid min-h-screen place-items-center bg-[#f8f5ef] p-8 text-center">
      <div>
        <p className="text-[10px] font-extrabold tracking-[.18em] text-[#df1f3d]">SUGI ASAYAKE ADMIN</p>
        <h1 className="mt-3 font-[var(--font-display)] text-4xl font-semibold tracking-[-.08em]">Нэвтэрч үргэлжлүүлнэ үү.</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#707176]">Энэ хэсгийг үзэхийн тулд эхлээд нэвтэрсэн байх шаардлагатай.</p>
        <button type="button" onClick={startLogin} className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]"><LogIn size={16} />Нэвтрэх</button>
      </div>
    </div>;
  }

  if (!hasAccess) {
    return <div className="grid min-h-screen place-items-center bg-[#f8f5ef] p-8 text-center">
      <div>
        <p className="text-[10px] font-extrabold tracking-[.16em] text-[#df1f3d]">ADMIN ONLY</p>
        <h1 className="mt-3 font-[var(--font-display)] text-4xl font-semibold tracking-[-.08em]">Админ эрх шаардлагатай.</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#707176]">Нэвтэрсэн хэрэглэгчид default байдлаар customer эрхтэй. Owner эсвэл одоогийн админ Хэрэглэгч хэсгээс role-ийг ажилтны эрх (staff/finance/marketing/warehouse) эсвэл admin болгож шинэчилнэ.</p>
      </div>
    </div>;
  }

  // Admin face gate (2026-09-08, Tom explicit: "only users that has access to
  // ./admin page"): the second factor sits HERE, after the role check and
  // before the panel mounts, so it covers all five panel roles and nothing
  // else in the app. When ADMIN_FACE_GATE_ENABLED is off, AdminFaceGate
  // renders its children immediately and this line behaves exactly as it did
  // before the gate existed.
  return (
    <AdminFaceGate>
      <AdminWorkspace />
    </AdminFaceGate>
  );
}
