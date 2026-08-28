import { Home, LayoutDashboard, PackagePlus, UsersRound } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import AdminWorkspace from "@/components/AdminWorkspace";

const menuItems: DashboardMenuItem[] = [
  { icon: Home, label: "Нүүр хуудас", path: "/" },
  { icon: LayoutDashboard, label: "Удирдлага", path: "/admin" },
  { icon: PackagePlus, label: "Бүтээгдэхүүн", path: "/admin?section=products" },
  { icon: UsersRound, label: "Хэрэглэгч", path: "/admin?adminSection=users" },
];

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const hasAccess = user?.role === "admin" || user?.role === "staff";
  return <DashboardLayout brand="SUGI ASAYAKE" menuItems={menuItems}>{!loading && !hasAccess ? <div className="grid min-h-[70vh] place-items-center rounded-3xl bg-[#f8f5ef] p-8 text-center"><div><p className="text-[10px] font-extrabold tracking-[.16em] text-[#df1f3d]">ADMIN ONLY</p><h1 className="mt-3 font-[var(--font-display)] text-4xl font-semibold tracking-[-.08em]">Админ эрх шаардлагатай.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#707176]">Нэвтэрсэн хэрэглэгчид default байдлаар customer эрхтэй. Owner эсвэл одоогийн админ user хүснэгтээс role-ийг admin эсвэл staff болгож шинэчилнэ.</p></div></div> : <AdminWorkspace />}</DashboardLayout>;
}
