import { Bell, ChevronDown, CircleUserRound, Command, Home, LogOut, Menu, Moon, Store, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toggleAdminTheme, useAdminTheme } from "@/lib/adminTheme";

/**
 * The reference's top bar: a rounded search field on the left, a row of
 * circular icon buttons on the right (translate / layout / moon / bell in the
 * reference), then the avatar.
 *
 * Every button here does something real. The reference's translate and layout
 * icons have no equivalent feature in this app, so instead of rendering dead
 * chrome the row is: open the storefront, open the command palette, toggle the
 * admin's dark mode (new -- Tom, explicit), and notifications. The moon/sun is
 * the reference's own moon slot, finally wired to a real preference.
 */
export default function AdminTopBar({ sectionLabel, onOpenMobileSidebar, searchSlot, notificationCount, notificationLabel, onOpenNotifications, onOpenCommandPalette, userName, userRoleLabel, userAvatarUrl, onLogout }: {
  sectionLabel: string;
  onOpenMobileSidebar: () => void;
  searchSlot?: ReactNode;
  notificationCount: number;
  notificationLabel: string;
  onOpenNotifications: () => void;
  onOpenCommandPalette: () => void;
  userName: string;
  userRoleLabel: string;
  userAvatarUrl: string | null;
  onLogout: () => void;
}) {
  const theme = useAdminTheme();

  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-[var(--a-border)] bg-[var(--a-canvas)]/85 px-4 py-3 backdrop-blur-md sm:flex-nowrap sm:gap-4 sm:px-7">
      <button type="button" onClick={onOpenMobileSidebar} className="admin-icon-btn shrink-0 lg:hidden" aria-label="Цэс нээх"><Menu size={18} /></button>

      {searchSlot && <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:max-w-md sm:flex-1">{searchSlot}</div>}

      {/* Breadcrumb only shows once the search has its own row (small screens
          squeeze both), so the bar never wraps into three lines. */}
      <p className="hidden min-w-0 truncate text-[12px] font-semibold text-[var(--a-muted)] xl:block">
        <Link href="/" className="transition hover:text-[var(--a-text)]">Нүүр</Link>
        <span className="mx-1.5">/</span>
        <span className="text-[var(--a-text)]">{sectionLabel}</span>
      </p>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Link href="/" className="admin-icon-btn hidden sm:grid" title="Дэлгүүрийн сайт нээх" aria-label="Дэлгүүрийн сайт нээх"><Store size={17} /></Link>
        <button type="button" onClick={onOpenCommandPalette} className="admin-icon-btn hidden sm:grid" title="Хайх (Ctrl+K)" aria-label="Командын хайлт нээх"><Command size={17} /></button>
        <button
          type="button"
          onClick={toggleAdminTheme}
          className="admin-icon-btn"
          title={theme === "dark" ? "Гэрэлтэй горим" : "Харанхуй горим"}
          aria-label={theme === "dark" ? "Гэрэлтэй горимд шилжих" : "Харанхуй горимд шилжих"}
          aria-pressed={theme === "dark"}
        >
          {theme === "dark" ? <Sun size={17} className="admin-pop" /> : <Moon size={17} className="admin-pop" />}
        </button>
        <button type="button" onClick={onOpenNotifications} className="admin-icon-btn relative" title={notificationLabel} aria-label={notificationLabel}>
          <Bell size={17} />
          {notificationCount > 0 && (
            <span className="absolute right-2 top-2 size-2">
              <span className="admin-ping" aria-hidden="true" />
              <span className="absolute inset-0 rounded-full" style={{ background: "var(--a-neg)" }} aria-hidden="true" />
            </span>
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="ml-0.5 flex items-center gap-2 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] py-1 pl-1 pr-2 transition hover:bg-[var(--a-soft)] active:scale-[.97]">
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt="" className="size-8 rounded-full object-cover" />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-[var(--a-soft-hover)] text-[var(--a-text-soft)]"><CircleUserRound size={18} /></span>
              )}
              <span className="hidden text-left md:block">
                <span className="block max-w-[120px] truncate text-[12px] font-bold leading-4 text-[var(--a-text)]">{userName}</span>
                <span className="block text-[10px] leading-4 text-[var(--a-muted)]">{userRoleLabel}</span>
              </span>
              <ChevronDown size={14} className="text-[var(--a-muted)]" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[11px] font-normal text-[var(--a-muted)]">{userRoleLabel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/"><Home size={15} />Нүүр хуудас</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={toggleAdminTheme}>
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              {theme === "dark" ? "Гэрэлтэй горим" : "Харанхуй горим"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onLogout}><LogOut size={15} />Гарах</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
