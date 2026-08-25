import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { filterCatalogProducts } from "@shared/catalog-filter";

// Site-wide search-with-suggestions, reachable from every page (previously
// the only search box lived inside /shop's hero panel -- a shopper on Home,
// ProductDetail, or Profile had no way to search without first navigating
// there). Reuses the same trpc.catalog.list data Shop.tsx already fetches
// (react-query dedupes the request once both are mounted) and the same
// filterCatalogProducts matching logic, so results here are never
// inconsistent with what /shop itself would show for the same term.
const fallbackImage = "/product-placeholder.svg";
const formatMnt = (amount: number) => new Intl.NumberFormat("mn-MN").format(amount) + "₮";

export default function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const catalog = trpc.catalog.list.useQuery(undefined, { enabled: open });
  const products = catalog.data ?? [];
  const trimmed = term.trim();
  const matches = trimmed ? filterCatalogProducts(products, trimmed, "all").slice(0, 6) : [];

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const goToShop = () => {
    setOpen(false);
    window.location.assign(`/shop?q=${encodeURIComponent(trimmed)}`);
  };

  return <div ref={containerRef} className="header-search">
    <button type="button" onClick={() => setOpen(value => !value)} aria-label={open ? "Хайлт хаах" : "Хайх"} className="header-search-trigger">{open ? <X size={16} /> : <Search size={16} />}</button>
    {open && <div className="header-search-panel">
      <input ref={inputRef} value={term} onChange={event => setTerm(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && trimmed) goToShop(); }} placeholder="Бүтээгдэхүүн, брэндээр хайх" className="header-search-input" />
      {trimmed ? <div className="header-search-results">
        {catalog.isLoading ? <p className="header-search-empty">Хайж байна…</p> : matches.length ? <>
          {matches.map(product => <Link key={product.id} href={`/product/${product.slug}`} onClick={() => setOpen(false)} className="header-search-result">
            <img src={product.imageUrl ?? fallbackImage} alt="" />
            <span><strong>{product.name}</strong><small>{formatMnt(product.priceMnt)}</small></span>
          </Link>)}
          <button type="button" onClick={goToShop} className="header-search-viewall">&ldquo;{trimmed}&rdquo; -г бүх дэлгүүрээс харах →</button>
        </> : <p className="header-search-empty">Тохирох бүтээгдэхүүн олдсонгүй.</p>}
      </div> : null}
    </div>}
  </div>;
}
