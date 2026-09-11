import { LayoutDashboard, PackagePlus, CheckCircle2, CreditCard, FilePenLine, FileText, Star, ListChecks, Megaphone, Tag, Tags, ImageUp, UsersRound, ChartColumnIncreasing, ShieldAlert, Plug, CalendarDays, Send, Settings, MapPin, ShoppingBag, Smartphone, ScanBarcode, LogOut, Menu, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { AdminSection } from "../AdminWorkspace";
import { footerLogoUrl } from "../site-footer-data";

// One logo asset for the entire site -- reusing the storefront's own constant
// rather than a second hardcoded path that could drift when the file changes.
const ADMIN_LOGO_URL = footerLogoUrl;
// Square lockup for the collapsed rail (Home.tsx serves this same file).
const ADMIN_SYMBOL_URL = "/cdn/sugi-symbol_0a534a76.png";

export type NavItem = { key: AdminSection; label: string; Icon: LucideIcon };

// Real sections only -- the reference's own nav (Dashboard/Product/Inventory/
// Customers/Review/Payment/Integration + an ACCOUNT group) is mirrored in
// *structure* (two labelled groups, icon + label rows, an active pill, a
// count badge, a footer action) but never in content: nothing here is a
// section this admin doesn't actually have.
// Flat, like the reference (Dashboard / Product / Inventory / Customers /
// Review / Payment / Integration -- one level, no expandable parent). The
// previous build nested these three under a "Хянах самбар" toggle; Tom
// compared the two screens side by side and the extra level was the
// difference, so it's gone.
const nestedGroup: NavItem[] = [
  { key: "dashboard", label: "Хянах самбар", Icon: LayoutDashboard },
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
  { key: "calendar", label: "Хуанли", Icon: CalendarDays },
  { key: "discountCodes", label: "Хямдралын код", Icon: Tag },
  { key: "brands", label: "Брэндүүд", Icon: Tags },
  { key: "media", label: "Content & Media", Icon: ImageUp },
  { key: "documents", label: "Баримт бичиг", Icon: FileText },
  { key: "campaigns", label: "Кампанит ажил", Icon: Send },
  { key: "storeSettings", label: "Дэлгүүрийн тохиргоо", Icon: Settings },
  { key: "branches", label: "Салбарууд", Icon: MapPin },
  { key: "pos", label: "Дэлгүүрийн худалдаа", Icon: ShoppingBag },
  { key: "receiving", label: "Бараа хүлээн авах", Icon: ScanBarcode },
  { key: "notifications", label: "Утасны мэдэгдэл", Icon: Smartphone },
];
const adminOnlyFlatGroup: NavItem[] = [
  { key: "loyalty", label: "Гишүүнчлэлийн зэрэглэл", Icon: CreditCard },
  { key: "users", label: "Хэрэглэгч", Icon: UsersRound },
  { key: "integrations", label: "Интеграцууд", Icon: Plug },
];

// Admin overhaul (2026-09-08, Phase C): section visibility per role, derived
// directly from server/routers.ts's Phase B procedure reassignment (see
// server/_core/trpc.ts's financeProcedure/marketingProcedure/
// warehouseProcedure/staffProcedure/adminProcedure). "media" here is the
// Content & Media CMS (site banner images/homepage copy -- ContentMediaPanel/
// ContentTextPanel, marketingProcedure), NOT staff's blog Media Library
// (that's a modal embedded inside the Posts composer, not its own nav
// section). "calendar" is the shared Content Calendar reading both posts and
// promotions (contentReadProcedure), open to staff AND marketing even though
// neither can write both halves of what it displays.
const SECTION_ROLES: Record<AdminSection, ReadonlySet<string>> = {
  dashboard: new Set(["staff", "finance", "marketing", "warehouse", "admin"]),
  analytics: new Set(["finance", "admin"]),
  security: new Set(["admin"]),
  products: new Set(["warehouse", "admin"]),
  // Phase E: finance needs to find a returned-but-unrefunded order before it
  // can call admin.refundOrder on it (see ordersReadProcedure in
  // server/_core/trpc.ts) -- fulfillment writes (status/tracking) stay
  // warehouse/admin-only, enforced server-side and mirrored client-side in
  // AdminOperationsPanel.tsx.
  orders: new Set(["warehouse", "finance", "admin"]),
  posts: new Set(["staff", "admin"]),
  reviews: new Set(["marketing", "admin"]),
  routines: new Set(["marketing", "admin"]),
  promotions: new Set(["marketing", "admin"]),
  calendar: new Set(["staff", "marketing", "admin"]),
  discountCodes: new Set(["marketing", "admin"]),
  brands: new Set(["marketing", "admin"]),
  media: new Set(["marketing", "admin"]),
  // Published page copy, same weight as Content & Media.
  documents: new Set(["marketing", "admin"]),
  // admin-only: unlike page copy, these percentages price real orders.
  loyalty: new Set(["admin"]),
  campaigns: new Set(["marketing", "admin"]),
  storeSettings: new Set(["marketing", "admin"]),
  // Phase J: same marketingProcedure weight/CRUD shape as `brands` above.
  branches: new Set(["marketing", "admin"]),
  // Phase M: same warehouseProcedure weight as the stock-editing endpoints
  // (recording a sale is stock-adjacent, not a merchandising/finance call).
  pos: new Set(["warehouse", "admin"]),
  // Phase H: same gap-fix shape as `orders` above -- finance needs to find
  // a customer before it can call admin.adjustStoreCredit on them.
  // Account-changing writes (suspend, role, phone, loyalty adjustment)
  // stay admin-only, enforced server-side (usersReadProcedure vs.
  // adminProcedure in server/_core/trpc.ts) and mirrored client-side in
  // AdminWorkspace.tsx/AdminUserDetailDrawer.tsx.
  users: new Set(["finance", "admin"]),
  integrations: new Set(["admin"]),
  // 2026-09-11: everyone who has a notification group (shared/
  // notification-events.ts groupsForRole) subscribes their own phone here.
  // Marketing has no group, so no entry.
  notifications: new Set(["staff", "finance", "warehouse", "admin"]),
  // 2026-09-11 (Phase 3): store consultants (staff) receive deliveries; see
  // inventoryProcedure in server/_core/trpc.ts.
  receiving: new Set(["staff", "warehouse", "admin"]),
};

// Exported so the command palette (AdminCommandPalette.tsx) lists exactly
// the same sections, in the same order, with the same per-role visibility
// this sidebar itself enforces -- reuses these same three arrays plus
// SECTION_ROLES rather than a second, hand-copied list that could drift out
// of sync.
export function getVisibleSections(role: string): NavItem[] {
  const isVisible = (item: NavItem) => SECTION_ROLES[item.key].has(role);
  return [...nestedGroup.filter(isVisible), ...flatGroup.filter(isVisible), ...adminOnlyFlatGroup.filter(isVisible)];
}

/** Counts shown as pills on nav rows, mirroring the reference's green "02" on
 *  Review. Every one is a real, actionable number (out-of-stock products,
 *  failed payments) -- a badge that isn't worth clicking is worse than none. */
export type NavBadges = Partial<Record<AdminSection, number>>;

function NavButton({ item, active, badge, collapsed = false, onSelect }: { item: NavItem; active: boolean; badge?: number; collapsed?: boolean; onSelect: (section: AdminSection) => void }) {
  const Icon = item.Icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={`admin-nav-item relative flex items-center rounded-[10px] py-2.5 text-left text-[13.5px] font-semibold ${collapsed ? "justify-center px-0" : "gap-3 px-3"} ${active ? "bg-[var(--a-rail-active)] text-[var(--a-rail-text-strong)]" : "text-[var(--a-rail-text)] hover:bg-white/[.06] hover:text-[var(--a-rail-text-strong)]"}`}
    >
      <Icon size={17} aria-hidden="true" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {badge != null && badge > 0 && (collapsed ? (
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full" style={{ background: "var(--a-pos)" }} aria-hidden="true" />
      ) : (
        <span className="admin-pop shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "var(--a-pos-soft)", color: "var(--a-pos)" }}>
          {String(badge).padStart(2, "0")}
        </span>
      ))}
    </button>
  );
}

function SidebarNavContent({ section, role, badges, collapsed = false, onSelect, onLogout, onToggleCollapse }: {
  section: AdminSection;
  role: string;
  badges: NavBadges;
  collapsed?: boolean;
  onSelect: (section: AdminSection) => void;
  onLogout: () => void;
  /** The hamburger. On desktop it collapses the rail to icons; inside the
   *  mobile drawer it closes the drawer. Same button, same place as the
   *  reference (top-right of the rail, beside the wordmark) either way. */
  onToggleCollapse: () => void;
}) {
  const visibleNested = nestedGroup.filter(item => SECTION_ROLES[item.key].has(role));
  const visibleFlat = flatGroup.filter(item => SECTION_ROLES[item.key].has(role));
  const visibleAdminOnly = adminOnlyFlatGroup.filter(item => SECTION_ROLES[item.key].has(role));

  return (
    <div className={`flex h-full flex-col bg-[var(--a-rail)] text-white ${collapsed ? "px-2 py-3" : "p-3"}`}>
      {/* Brand lockup + hamburger — the reference puts both here, in the rail,
          not in the top bar. */}
      <div className={`flex items-center py-2 ${collapsed ? "justify-center" : "gap-2.5 px-2"}`}>
        {/* The real SUGI ASAYAKE logo, not a stand-in icon (Tom, explicit) --
            the same two assets the storefront already serves, so the site has
            one logo file, not a second admin copy.

            On a white plate because the logo is dark ink on transparent
            (measured: average ink luminance 67/255) and the rail is near-black
            -- placed directly on it, "ASAYAKE" disappeared entirely. The
            collapsed rail swaps the wide wordmark for the square symbol, which
            is the only form that stays legible at 40px. */}
        <span className={`grid shrink-0 place-items-center rounded-xl bg-white ${collapsed ? "size-10 p-1" : "h-10 px-2.5"}`}>
          <img
            src={collapsed ? ADMIN_SYMBOL_URL : ADMIN_LOGO_URL}
            alt="SUGI ASAYAKE"
            className={collapsed ? "size-full object-contain" : "h-6 w-auto max-w-[124px] object-contain"}
          />
        </span>
        {!collapsed && (
          <button type="button" onClick={onToggleCollapse} className="shrink-0 rounded-lg p-1.5 text-[var(--a-rail-text)] transition hover:bg-white/10 hover:text-white" aria-label="Цэсийг хураах">
            <Menu size={18} />
          </button>
        )}
      </div>
      {collapsed && (
        <button type="button" onClick={onToggleCollapse} className="mt-2 grid place-items-center rounded-[10px] py-2.5 text-[var(--a-rail-text)] transition hover:bg-white/10 hover:text-white" aria-label="Цэсийг дэлгэх">
          <Menu size={18} />
        </button>
      )}

      <nav className="admin-sidebar-nav mt-2 grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto">
        {collapsed ? <span className="h-3" /> : <p className="px-3 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[.16em] text-white/35">Ерөнхий</p>}
        {visibleNested.map(item => <NavButton key={item.key} item={item} active={section === item.key} badge={badges[item.key]} collapsed={collapsed} onSelect={onSelect} />)}
        {visibleFlat.map(item => <NavButton key={item.key} item={item} active={section === item.key} badge={badges[item.key]} collapsed={collapsed} onSelect={onSelect} />)}
        {visibleAdminOnly.length > 0 && (
          <>
            {collapsed ? <span className="my-1 h-px bg-[var(--a-rail-border)]" /> : <p className="px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[.16em] text-white/35">Удирдлага</p>}
            {visibleAdminOnly.map(item => <NavButton key={item.key} item={item} active={section === item.key} badge={badges[item.key]} collapsed={collapsed} onSelect={onSelect} />)}
          </>
        )}
      </nav>

      {/* The reference's footer Logout row. */}
      <button
        type="button"
        onClick={onLogout}
        title={collapsed ? "Гарах" : undefined}
        className={`admin-nav-item mt-3 flex items-center rounded-[10px] border-t border-[var(--a-rail-border)] pb-1 pt-4 text-left text-[13.5px] font-semibold text-[var(--a-rail-text)] hover:text-white ${collapsed ? "justify-center px-0" : "gap-3 px-3"}`}
      >
        <LogOut size={17} aria-hidden="true" />{!collapsed && "Гарах"}
      </button>
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
export default function AdminSidebar({ section, role, badges = {}, onSelect, onLogout, mobileOpen, onMobileOpenChange }: {
  section: AdminSection;
  role: string;
  badges?: NavBadges;
  onSelect: (section: AdminSection) => void;
  onLogout: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  // Collapse is desktop-only and local to the rail -- nothing else in the
  // admin needs to know the width, the content column is just flex-1.
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* sticky + h-screen -- without this the aside is just a natural-
          height flex sibling of the main content column, so on a tall page
          (e.g. the Products list) it stretches to match that height. The
          nav is a CSS grid with no explicit row sizing, so that extra
          vertical space then gets distributed BETWEEN the nav buttons via
          grid's default align-content:stretch -- exactly the "broken
          padding" (huge gaps between menu items) this was. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 self-start transition-[width] duration-300 ease-[var(--ease-out)] lg:block ${collapsed ? "w-[72px]" : "w-[236px]"}`}
      >
        <SidebarNavContent section={section} role={role} badges={badges} collapsed={collapsed} onSelect={onSelect} onLogout={onLogout} onToggleCollapse={() => setCollapsed(current => !current)} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-[262px] border-none bg-[var(--a-rail)] p-0 [&_[data-slot=sheet-close]]:hidden">
          <SheetTitle className="sr-only">Удирдлагын цэс</SheetTitle>
          {/* Selecting a section on mobile also dismisses the drawer -- the
              desktop instance above doesn't need this, there's nothing to
              close. */}
          <SidebarNavContent
            section={section}
            role={role}
            badges={badges}
            onSelect={target => { onSelect(target); onMobileOpenChange(false); }}
            onLogout={onLogout}
            onToggleCollapse={() => onMobileOpenChange(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
