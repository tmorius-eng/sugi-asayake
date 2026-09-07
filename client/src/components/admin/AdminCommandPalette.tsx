import { useEffect, useState } from "react";
import { FilePenLine, LoaderCircle, Megaphone, Package, Receipt, Tag, UserRound } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";
import { getVisibleSections } from "./AdminSidebar";
import type { AdminSection } from "../AdminWorkspace";

/**
 * Project "SUGI Desk" — Frappe Desk's ⌘K/Ctrl+K global command palette,
 * built on this repo's own already-installed (but until now unused)
 * shadcn `Command`/`cmdk` primitives (client/src/components/ui/command.tsx).
 *
 * Two independent, purpose-built lists, not one cmdk-auto-filtered list:
 * - **Sections**: reuses `getVisibleSections` from AdminSidebar.tsx --
 *   exactly the same items, order, and staff/admin visibility the sidebar
 *   itself enforces, filtered client-side against the typed text.
 * - **Records**: the exact same `admin.search` query/results
 *   AdminGlobalSearch.tsx already uses for the top-bar search box --
 *   deliberately not duplicated logic, just a second place that calls it.
 *
 * `shouldFilter={false}` on <Command> because cmdk's own built-in filtering
 * only makes sense for a single static list; mixing it with server-driven
 * async results would fight cmdk's internal state instead of just rendering
 * what we already computed.
 */
export default function AdminCommandPalette({ preview, isFullAdmin, onNavigate, onSelectProduct, onSelectOrder, onSelectUser }: {
  preview: boolean;
  isFullAdmin: boolean;
  onNavigate: (section: AdminSection) => void;
  onSelectProduct: (skuOrName: string) => void;
  onSelectOrder: (orderNumber: string) => void;
  onSelectUser: (emailOrName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(current => !current);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) { setQuery(""); setDebounced(""); }
  }, [open]);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(handle);
  }, [query]);

  const searchQuery = trpc.admin.search.useQuery({ query: debounced }, { enabled: !preview && open && debounced.length >= 2 });
  const results = searchQuery.data;

  const needle = query.trim().toLowerCase();
  const matchingSections = getVisibleSections(isFullAdmin).filter(item => !needle || item.label.toLowerCase().includes(needle));
  const isSearching = !preview && debounced.length >= 2;
  const hasSearchResults = Boolean(results && results.products.length + results.orders.length + results.users.length + results.discountCodes.length + results.promotions.length + results.posts.length > 0);
  // 2026-09-07 real bug, found live: this used to be `!results` (i.e. "the
  // query hasn't come back yet"), which meant once a search legitimately
  // resolved with zero matches (e.g. searching for a discount code --
  // admin.search only covers products/orders/users, never did cover
  // discount codes/routines/promotions/etc.), NOTHING rendered at all: not
  // an empty state, not a hint, just a blank list. This only shows "no
  // results" once we actually know there's nothing left to show.
  const showEmptyState = matchingSections.length === 0 && !searchQuery.isLoading && (!isSearching || !hasSearchResults);

  const select = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false} title="Хурдан командын цонх" description="Хэсэг рүү шилжих, эсвэл бүтээгдэхүүн/захиалга/хэрэглэгч хайх">
      <CommandInput value={query} onValueChange={setQuery} placeholder="Хэсэг рүү шилжих, эсвэл хайх… (Ctrl+K)" />
      <CommandList>
        {showEmptyState && <CommandEmpty>Илэрц олдсонгүй. (Хэсэг, бүтээгдэхүүн, захиалга, хэрэглэгч, хямдралын код, урамшуулал, постоор хайдаг.)</CommandEmpty>}
        {matchingSections.length > 0 && (
          <CommandGroup heading="ХЭСЭГ РҮҮ ШИЛЖИХ">
            {matchingSections.map(item => (
              <CommandItem key={item.key} value={item.key} onSelect={() => select(() => onNavigate(item.key))}>
                <item.Icon size={15} />{item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!preview && debounced.length >= 2 && (
          <>
            <CommandSeparator />
            {searchQuery.isLoading && (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={13} />Хайж байна…</div>
            )}
            {results && results.products.length > 0 && (
              <CommandGroup heading="БҮТЭЭГДЭХҮҮН">
                {results.products.map(product => (
                  <CommandItem key={`product-${product.id}`} value={`product-${product.id}`} onSelect={() => select(() => onSelectProduct(product.sku))}>
                    <Package size={15} />
                    <span className="truncate">{product.name}</span>
                    <span className="ml-auto shrink-0 text-[#85868a]">{product.sku}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results && results.orders.length > 0 && (
              <CommandGroup heading="ЗАХИАЛГА">
                {results.orders.map(order => (
                  <CommandItem key={`order-${order.id}`} value={`order-${order.id}`} onSelect={() => select(() => onSelectOrder(order.orderNumber))}>
                    <Receipt size={15} />
                    <span className="truncate">{order.orderNumber} · {order.customerName}</span>
                    <span className="ml-auto shrink-0 text-[#85868a]">{formatMnt(order.totalMnt)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results && results.users.length > 0 && (
              <CommandGroup heading="ХЭРЭГЛЭГЧ">
                {results.users.map(user => (
                  <CommandItem key={`user-${user.id}`} value={`user-${user.id}`} onSelect={() => select(() => onSelectUser(user.phone ?? user.email ?? user.name ?? ""))}>
                    <UserRound size={15} />
                    <span className="truncate">{user.name ?? "Нэргүй хэрэглэгч"}</span>
                    <span className="ml-auto shrink-0 text-[#85868a]">{user.phone ?? user.email ?? "—"}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results && results.discountCodes.length > 0 && (
              <CommandGroup heading="ХЯМДРАЛЫН КОД">
                {results.discountCodes.map(discountCode => (
                  <CommandItem key={`discount-${discountCode.id}`} value={`discount-${discountCode.id}`} onSelect={() => select(() => onNavigate("discountCodes"))}>
                    <Tag size={15} />
                    <span className="truncate">{discountCode.code}</span>
                    <span className="ml-auto shrink-0 text-[#85868a]">{discountCode.isActive ? "Идэвхтэй" : "Идэвхгүй"}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results && results.promotions.length > 0 && (
              <CommandGroup heading="УРАМШУУЛАЛ">
                {results.promotions.map(promotion => (
                  <CommandItem key={`promotion-${promotion.id}`} value={`promotion-${promotion.id}`} onSelect={() => select(() => onNavigate("promotions"))}>
                    <Megaphone size={15} />
                    <span className="truncate">{promotion.headline}</span>
                    <span className="ml-auto shrink-0 text-[#85868a]">{promotion.isActive ? "Идэвхтэй" : "Идэвхгүй"}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results && results.posts.length > 0 && (
              <CommandGroup heading="ПОСТ">
                {results.posts.map(post => (
                  <CommandItem key={`post-${post.id}`} value={`post-${post.id}`} onSelect={() => select(() => onNavigate("posts"))}>
                    <FilePenLine size={15} />
                    <span className="truncate">{post.title}</span>
                    <span className="ml-auto shrink-0 text-[#85868a]">{post.isPublished ? "Нийтэлсэн" : "Ноорог"}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
