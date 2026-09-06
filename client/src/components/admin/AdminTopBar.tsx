import { Bell, CircleUserRound, Home, LogOut, Menu } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// The reference's global top bar (hamburger/breadcrumb/search/
// notifications/avatar) -- the existing per-section header (title/
// description/action-buttons, already in AdminWorkspace.tsx) sits directly
// below this, unchanged; this component only replaces what used to live
// nowhere (there was no top bar at all before). `searchSlot` carries the
// existing cross-section AdminGlobalSearch -- it isn't tied to any one
// section's content, so it belongs in this persistent bar, not the
// per-section header.
export default function AdminTopBar({ sectionLabel, onOpenMobileSidebar, searchSlot, notificationCount, userName, userRoleLabel, userAvatarUrl, onLogout }: {
  sectionLabel: string;
  onOpenMobileSidebar: () => void;
  searchSlot?: ReactNode;
  notificationCount: number;
  userName: string;
  userRoleLabel: string;
  userAvatarUrl: string | null;
  onLogout: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/7 bg-[#f8f5ef] px-4 py-3 sm:flex-nowrap sm:gap-4 sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onOpenMobileSidebar} className="grid size-9 shrink-0 place-items-center rounded-full text-[#57585e] transition hover:bg-black/5 lg:hidden" aria-label="Цэс нээх"><Menu size={18} /></button>
        <p className="truncate text-xs font-bold text-[#8a8b8f]"><Link href="/" className="hover:text-[#df1f3d]">Нүүр</Link><span className="mx-1.5">/</span><span className="text-[#17181b]">{sectionLabel}</span></p>
      </div>
      {searchSlot && <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-sm">{searchSlot}</div>}
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="relative grid size-9 place-items-center rounded-full text-[#57585e] transition hover:bg-black/5" title={notificationCount > 0 ? `${notificationCount} анхаарах зүйл` : "Анхаарах зүйл алга"}>
          <Bell size={17} />
          {notificationCount > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#df1f3d]" />}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="ml-1 flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-black/5">
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt="" className="size-8 rounded-full object-cover" />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-[#f1ede6] text-[#57585e]"><CircleUserRound size={18} /></span>
              )}
              <span className="hidden text-left sm:block">
                <span className="block text-xs font-bold leading-4">{userName}</span>
                <span className="block text-[10px] leading-4 text-[#8a8b8f]">{userRoleLabel}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild><Link href="/"><Home size={15} />Нүүр хуудас</Link></DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onLogout}><LogOut size={15} />Гарах</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
