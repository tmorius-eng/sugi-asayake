import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Package, Receipt, Search, UserRound, type LucideIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";


export default function AdminGlobalSearch({ preview = false, onSelectProduct, onSelectOrder, onSelectUser }: {
  preview?: boolean;
  onSelectProduct: (skuOrName: string) => void;
  onSelectOrder: (orderNumber: string) => void;
  onSelectUser: (emailOrName: string) => void;
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
  const hasResults = Boolean(results && results.products.length + results.orders.length + results.users.length > 0);
  const select = (action: () => void) => { action(); setOpen(false); setTerm(""); };

  return (
    <div ref={containerRef} className="relative w-full sm:w-80">
      <label className="flex h-10 items-center gap-2 rounded-full border border-black/10 bg-[#fffdf9] px-4">
        <Search size={15} className="text-[#85868a]" />
        <input value={term} onChange={event => { setTerm(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Хэрэглэгч, захиалга, бүтээгдэхүүн хайх…" className="w-full bg-transparent text-xs outline-none" />
      </label>
      {open && debounced.length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-40 max-h-96 overflow-y-auto rounded-2xl border border-black/8 bg-white p-2 shadow-[0_16px_34px_rgba(20,22,24,.14)]">
          {preview && <p className="p-3 text-xs text-[#77787d]">Preview горимд хайлт ажиллахгүй.</p>}
          {!preview && searchQuery.isLoading && <p className="flex items-center gap-2 p-3 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={13} />Хайж байна…</p>}
          {!preview && searchQuery.error && <p className="p-3 text-xs text-[#a51630]">{searchQuery.error.message}</p>}
          {!preview && results && !hasResults && <p className="p-3 text-xs text-[#77787d]">Илэрц олдсонгүй.</p>}
          {!preview && results && results.products.length > 0 && (
            <ResultGroup label="БҮТЭЭГДЭХҮҮН" icon={Package}>
              {results.products.map(product => (
                <button key={product.id} type="button" onClick={() => select(() => onSelectProduct(product.sku))} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-[#f8f5ef]">
                  <span className="truncate font-bold">{product.name}</span>
                  <span className="shrink-0 text-[#85868a]">{product.sku}</span>
                </button>
              ))}
            </ResultGroup>
          )}
          {!preview && results && results.orders.length > 0 && (
            <ResultGroup label="ЗАХИАЛГА" icon={Receipt}>
              {results.orders.map(order => (
                <button key={order.id} type="button" onClick={() => select(() => onSelectOrder(order.orderNumber))} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-[#f8f5ef]">
                  <span className="truncate font-bold">{order.orderNumber} · {order.customerName}</span>
                  <span className="shrink-0 text-[#85868a]">{formatMnt(order.totalMnt)}</span>
                </button>
              ))}
            </ResultGroup>
          )}
          {!preview && results && results.users.length > 0 && (
            <ResultGroup label="ХЭРЭГЛЭГЧ" icon={UserRound}>
              {results.users.map(user => (
                <button key={user.id} type="button" onClick={() => select(() => onSelectUser(user.phone ?? user.email ?? user.name ?? ""))} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-[#f8f5ef]">
                  <span className="truncate font-bold">{user.name ?? "Нэргүй хэрэглэгч"}</span>
                  <span className="shrink-0 text-[#85868a]">{user.phone ?? user.email ?? "—"}</span>
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
      <p className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-extrabold tracking-[.12em] text-[#8a8b8f]"><Icon size={11} />{label}</p>
      <div className="grid gap-0.5">{children}</div>
    </div>
  );
}
