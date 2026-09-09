import { useEffect, useRef, useState, type ReactNode } from "react";
import { FilePenLine, LoaderCircle, Megaphone, Package, Receipt, Search, Tag, UserRound, type LucideIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";
import type { AdminSection } from "./AdminWorkspace";


export default function AdminGlobalSearch({ preview = false, onSelectProduct, onSelectOrder, onSelectUser, onNavigate }: {
  preview?: boolean;
  onSelectProduct: (skuOrName: string) => void;
  onSelectOrder: (orderNumber: string) => void;
  onSelectUser: (emailOrName: string) => void;
  // 2026-09-07 (Project "SUGI Desk"): discount codes/promotions/posts don't
  // have a single-record deep-link like product SKU/order number/user
  // email do (AdminDiscountCodesPanel/AdminPromotionsPanel/AdminPostsPanel
  // don't take a search query), so a match in one of these just navigates to
  // its section -- same as AdminCommandPalette.tsx already does for these
  // exact three categories.
  onNavigate: (section: AdminSection) => void;
}) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(handle);
  }, [term]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const searchQuery = trpc.admin.search.useQuery({ query: debounced }, { enabled: !preview && debounced.length >= 2 });
  const results = searchQuery.data;
  const hasResults = Boolean(results && results.products.length + results.orders.length + results.users.length + results.discountCodes.length + results.promotions.length + results.posts.length > 0);
  const select = (action: () => void) => { action(); setOpen(false); setTerm(""); };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Reference top-bar search: full-radius pill, card surface, quiet
          magnifier. Token-driven so it follows the admin's dark mode. */}
      <label className="flex h-10 items-center gap-2.5 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-4 transition focus-within:border-[var(--a-border-strong)]">
        <Search size={15} className="shrink-0 text-[var(--a-faint)]" />
        <input value={term} onChange={event => { setTerm(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Хэрэглэгч, захиалга, бүтээгдэхүүн хайх…" className="w-full bg-transparent text-[13px] text-[var(--a-text)] outline-none placeholder:text-[var(--a-faint)]" />
      </label>
      {open && debounced.length >= 2 && (
        <div className="admin-pop absolute left-0 right-0 top-12 z-40 max-h-96 overflow-y-auto rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-2 shadow-[var(--a-shadow-pop)]">
          {preview && <p className="p-3 text-xs text-[var(--a-muted)]">Preview горимд хайлт ажиллахгүй.</p>}
          {!preview && searchQuery.isLoading && <p className="flex items-center gap-2 p-3 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={13} />Хайж байна…</p>}
          {!preview && searchQuery.error && <p className="p-3 text-xs text-[var(--a-neg)]">{searchQuery.error.message}</p>}
          {!preview && results && !hasResults && <p className="p-3 text-xs text-[var(--a-muted)]">Илэрц олдсонгүй.</p>}
          {!preview && results && results.products.length > 0 && (
            <ResultGroup label="БҮТЭЭГДЭХҮҮН" icon={Package}>
              {results.products.map(product => (
                <button key={product.id} type="button" onClick={() => select(() => onSelectProduct(product.sku))} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-[var(--a-soft)]">
                  <span className="truncate font-bold">{product.name}</span>
                  <span className="shrink-0 text-[var(--a-faint)]">{product.sku}</span>
                </button>
              ))}
            </ResultGroup>
          )}
          {!preview && results && results.orders.length > 0 && (
            <ResultGroup label="ЗАХИАЛГА" icon={Receipt}>
              {results.orders.map(order => (
                <button key={order.id} type="button" onClick={() => select(() => onSelectOrder(order.orderNumber))} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-[var(--a-soft)]">
                  <span className="truncate font-bold">{order.orderNumber} · {order.customerName}</span>
                  <span className="shrink-0 text-[var(--a-faint)]">{formatMnt(order.totalMnt)}</span>
                </button>
              ))}
            </ResultGroup>
          )}
          {!preview && results && results.users.length > 0 && (
            <ResultGroup label="ХЭРЭГЛЭГЧ" icon={UserRound}>
              {results.users.map(user => (
                <button key={user.id} type="button" onClick={() => select(() => onSelectUser(user.phone ?? user.email ?? user.name ?? ""))} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-[var(--a-soft)]">
                  <span className="truncate font-bold">{user.name ?? "Нэргүй хэрэглэгч"}</span>
                  <span className="shrink-0 text-[var(--a-faint)]">{user.phone ?? user.email ?? "—"}</span>
                </button>
              ))}
            </ResultGroup>
          )}
          {!preview && results && results.discountCodes.length > 0 && (
            <ResultGroup label="ХЯМДРАЛЫН КОД" icon={Tag}>
              {results.discountCodes.map(discountCode => (
                <button key={discountCode.id} type="button" onClick={() => select(() => onNavigate("discountCodes"))} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-[var(--a-soft)]">
                  <span className="truncate font-bold">{discountCode.code}</span>
                  <span className="shrink-0 text-[var(--a-faint)]">{discountCode.isActive ? "Идэвхтэй" : "Идэвхгүй"}</span>
                </button>
              ))}
            </ResultGroup>
          )}
          {!preview && results && results.promotions.length > 0 && (
            <ResultGroup label="УРАМШУУЛАЛ" icon={Megaphone}>
              {results.promotions.map(promotion => (
                <button key={promotion.id} type="button" onClick={() => select(() => onNavigate("promotions"))} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-[var(--a-soft)]">
                  <span className="truncate font-bold">{promotion.headline}</span>
                  <span className="shrink-0 text-[var(--a-faint)]">{promotion.isActive ? "Идэвхтэй" : "Идэвхгүй"}</span>
                </button>
              ))}
            </ResultGroup>
          )}
          {!preview && results && results.posts.length > 0 && (
            <ResultGroup label="ПОСТ" icon={FilePenLine}>
              {results.posts.map(post => (
                <button key={post.id} type="button" onClick={() => select(() => onNavigate("posts"))} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-[var(--a-soft)]">
                  <span className="truncate font-bold">{post.title}</span>
                  <span className="shrink-0 text-[var(--a-faint)]">{post.isPublished ? "Нийтэлсэн" : "Ноорог"}</span>
                </button>
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ label, icon: Icon, children }: { label: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-extrabold tracking-[.12em] text-[var(--a-faint)]"><Icon size={11} />{label}</p>
      <div className="grid gap-0.5">{children}</div>
    </div>
  );
}
