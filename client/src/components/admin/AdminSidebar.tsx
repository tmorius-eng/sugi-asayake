import { ChevronDown, ChevronRight, CircleUserRound, LayoutDashboard, PackagePlus, CheckCircle2, FilePenLine, Star, ListChecks, Megaphone, Tag, Tags, ImageUp, UsersRound, ChartColumnIncreasing, ShieldAlert, Plug, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { AdminSection } from "../AdminWorkspace";

type NavItem = { key: AdminSection; label: string; Icon: LucideIcon };

// Real sections only -- Gentelella's own demo nav (Forms/Tables/Charts/
// Calendar/Map/Chat/Inbox/Kanban) has no equivalent here and none of that
// is invented. Regrouped, not label-swapped: "Хянах самбар" nests
// Тойм/Аналитик/Аюулгүй байдал (mirrors the reference's expandable
// "Dashboards" > Operations/Analytics/System health), the rest are flat.
const nestedGroup: NavItem[] = [
  { key: "dashboard", label: "Тойм", Icon: LayoutDashboard },
  { key: "analytics", label: "Аналитик", Icon: ChartColumnIncreasing },
  { key: "security", label: "Аюулгүй байдал", Icon: ShieldAlert },
];
const flatGroup: NavItem[] = [
  { key: "products", label: "Бүтээгдэхүүн", Icon: PackagePlus },
  { key: "orders", label: "Захиалга", Icon: CheckCircle2 },
  { key: "posts", label: "Шинэ мэдээ", Icon: FilePenLine },
  { key: "reviews", label: "Сэтгэгдэл", Icon: Star },
  { key: "routines", label: "Routine", Icon: ListChecks },
  { key: "promotions", label: "Урамшуулал", Icon: Megaphone },
  { key: "discountCodes", label: "Хямдралын код", Icon: Tag },
  { key: "brands", label: "Брэндүүд", Icon: Tags },
  { key: "media", label: "Content & Media", Icon: ImageUp },
];
const adminOnlyFlatGroup: NavItem[] = [
  { key: "users", label: "Хэрэглэгч", Icon: UsersRound },
  { key: "integrations", label: "Интеграцууд", Icon: Plug },
];

function NavButton({ item, active, onSelect, nested = false }: { item: NavItem; active: boolean; onSelect: (section: AdminSection) => void; nested?: boolean }) {
  const Icon = item.Icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      className={`flex items-center gap-3 rounded-2xl py-3 text-left text-sm font-bold transition ${nested ? "pl-11 pr-3" : "px-3"} ${active ? "bg-white text-[#17181b]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
    >
      <Icon size={17} />{item.label}
    </button>
  );
}

function SidebarNavContent({ section, isFullAdmin, onSelect, userName, userRoleLabel, userAvatarUrl }: {
  section: AdminSection;
  isFullAdmin: boolean;
  onSelect: (section: AdminSection) => void;
  userName: string;
  userRoleLabel: string;
  userAvatarUrl: string | null;
}) {
  const visibleNested = isFullAdmin ? nestedGroup : nestedGroup.filter(item => item.key === "dashboard");
  const [expanded, setExpanded] = useState(true);
  const nestedActive = visibleNested.some(item => item.key === section);

  return (
    <div className="flex h-full flex-col bg-[#17181b] p-3 text-white">
      <div className="border-b border-white/12 px-3 py-4"><p className="text-[10px] font-extrabold tracking-[.15em] text-[#f0b52d]">SUGI ADMIN</p><p className="mt-1 text-sm text-white/65">Дэлгүүрийн удирдлага</p></div>
      <nav className="mt-3 grid flex-1 content-start gap-1 overflow-y-auto">
        <p className="px-3 pt-2 pb-1 text-[10px] font-extrabold tracking-[.15em] text-white/35">ЕРӨНХИЙ</p>
        {visibleNested.length > 1 ? (
          <>
            <button type="button" onClick={() => setExpanded(current => !current)} className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${nestedActive && !expanded ? "bg-white text-[#17181b]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
              <span className="flex items-center gap-3"><LayoutDashboard size={17} />Хянах самбар</span>
              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            {expanded && visibleNested.map(item => <NavButton key={item.key} item={item} active={section === item.key} onSelect={onSelect} nested />)}
          </>
        ) : (
          visibleNested.map(item => <NavButton key={item.key} item={item} active={section === item.key} onSelect={onSelect} />)
        )}
        {flatGroup.map(item => <NavButton key={item.key} item={item} active={section === item.key} onSelect={onSelect} />)}
        {isFullAdmin && (
          <>
            <p className="px-3 pt-4 pb-1 text-[10px] font-extrabold tracking-[.15em] text-white/35">УДИРДЛАГА</p>
            {adminOnlyFlatGroup.map(item => <NavButton key={item.key} item={item} active={section === item.key} onSelect={onSelect} />)}
          </>
        )}
      </nav>
      <div className="mt-3 flex items-center gap-3 border-t border-white/12 px-1 pt-3">
        {userAvatarUrl ? (
          <img src={userAvatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10"><CircleUserRound size={19} className="text-white/70" /></span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-bold">{userName}</p>
          <p className="text-[11px] text-white/50">{userRoleLabel}</p>
        </div>
      </div>
    </div>
  );
}

// Desktop: static, always-visible column. Mobile: the exact same nav
// content rendered inside a Sheet drawer -- plain useState + the generic,
// already-installed ui/sheet.tsx primitive (Radix Dialog), NOT
// ui/sidebar.tsx's shadcn Sidebar primitive. That primitive's own mobile
// path is already just Sheet wrapped in a large provider (cookie
// persistence, Cmd+B shortcut, resizable width, icon-collapse) this
// project doesn't need -- reaching for it again risks recreating the exact
// "second competing sidebar orchestration layer" that got the old
// DashboardLayout.tsx (double-sidebar bug) deleted. This is the ONE
// sidebar, just rendered in two containers.
export default function AdminSidebar({ section, isFullAdmin, onSelect, userName, userRoleLabel, userAvatarUrl, mobileOpen, onMobileOpenChange }: {
  section: AdminSection;
  isFullAdmin: boolean;
  onSelect: (section: AdminSection) => void;
  userName: string;
  userRoleLabel: string;
  userAvatarUrl: string | null;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      {/* sticky + h-screen -- without this the aside is just a natural-
          height flex sibling of the main content column, so on a tall page
          (e.g. the Products list) it stretches to match that height. The
          nav is a CSS grid with no explicit row sizing, so that extra
          vertical space then gets distributed BETWEEN the nav buttons via
          grid's default align-content:stretch -- exactly the "broken
          padding" (huge gaps between menu items) this was. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 self-start lg:block">
        <SidebarNavContent section={section} isFullAdmin={isFullAdmin} onSelect={onSelect} userName={userName} userRoleLabel={userRoleLabel} userAvatarUrl={userAvatarUrl} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-72 border-none bg-[#17181b] p-0 [&_[data-slot=sheet-close]]:text-white">
          <SheetTitle className="sr-only">Удирдлагын цэс</SheetTitle>
          {/* Selecting a section on mobile also dismisses the drawer -- the
              desktop instance above doesn't need this, there's nothing to
              close. */}
          <SidebarNavContent section={section} isFullAdmin={isFullAdmin} onSelect={target => { onSelect(target); onMobileOpenChange(false); }} userName={userName} userRoleLabel={userRoleLabel} userAvatarUrl={userAvatarUrl} />
        </SheetContent>
      </Sheet>
    </>
  );
}
