import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";

// Site-wide search-with-suggestions, reachable from every page (previously
// the only search box lived inside /shop's hero panel -- a shopper on Home,
// ProductDetail, or Profile had no way to search without first navigating
// there). Calls the same catalog.search FULLTEXT procedure /shop itself
// uses (ROADMAP.md TIER 2), so results here can never disagree with what
// /shop shows for the same term — this used to run its own client-side
// filterCatalogProducts substring match over the whole always-fetched
// catalog.list, which quietly drifted out of sync the moment /shop moved
// to server-side search: a term this box could substring-match mid-word
// (e.g. "рем" inside "крем") wouldn't necessarily FULLTEXT-match on /shop,
// so "view all results" could land a shopper on an empty/different page
// from what they just saw suggested.
const fallbackImage = "/product-placeholder.svg";
const MIN_QUERY_LENGTH = 2;

/**
 * `variant` (2026-09-12, Cosme Kitchen restyle): the reference site carries
 * a real, always-visible search field on its own row under the header, not
 * a magnifier that opens a popover. "inline" renders that field; the
 * suggestion panel, the debounce, the minimum length and the "see all
 * results" jump are identical in both variants -- only the trigger differs,
 * so there is one search implementation on the site rather than two.
 */
export default function HeaderSearch({ variant = "icon" }: { variant?: "icon" | "inline" } = {}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = term.trim();

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedTerm(trimmed), 300);
    return () => clearTimeout(handle);
  }, [trimmed]);

  const isSearchable = open && debouncedTerm.length >= MIN_QUERY_LENGTH;
  const search = trpc.catalog.search.useQuery({ query: debouncedTerm }, { enabled: isSearchable });
  const matches = (search.data ?? []).slice(0, 6);

  useEffect(() => { if (open && variant === "icon") inputRef.current?.focus(); }, [open, variant]);

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

  const results = (
    <>
      {trimmed ? <div className="header-search-results">
        {trimmed.length < MIN_QUERY_LENGTH ? <p className="header-search-empty">{`Дор хаяж ${MIN_QUERY_LENGTH} тэмдэгт оруулна уу.`}</p> : search.isLoading || debouncedTerm !== trimmed ? <p className="header-search-empty">Хайж байна…</p> : matches.length ? <>
          {matches.map(product => <Link key={product.id} href={`/product/${product.slug}`} onClick={() => setOpen(false)} className="header-search-result">
            <img src={product.imageUrl ?? fallbackImage} alt="" />
            <span><strong>{product.name}</strong><small>{formatMnt(product.priceMnt)}</small></span>
          </Link>)}
          <button type="button" onClick={goToShop} className="header-search-viewall">{`“${trimmed}” -г бүх дэлгүүрээс харах →`}</button>
        </> : <p className="header-search-empty">Тохирох бүтээгдэхүүн олдсонгүй.</p>}
      </div> : null}
    </>
  );

  if (variant === "inline") {
    return <div ref={containerRef} className="header-search header-search--inline">
      <div className="header-search-field">
        <input
          ref={inputRef}
          value={term}
          onChange={event => { setTerm(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={event => { if (event.key === "Enter" && trimmed) goToShop(); }}
          placeholder="Бүтээгдэхүүн, брэндээр хайх"
          aria-label="Бүтээгдэхүүн, брэндээр хайх"
          className="header-search-input"
        />
        <button type="button" onClick={() => { if (trimmed) goToShop(); else inputRef.current?.focus(); }} aria-label="Хайх" className="header-search-submit"><Search size={18} /></button>
      </div>
      {open && trimmed ? <div className="header-search-panel">{results}</div> : null}
    </div>;
  }

  return <div ref={containerRef} className="header-search">
    <button type="button" onClick={() => setOpen(value => !value)} aria-label={open ? "Хайлт хаах" : "Хайх"} className="header-search-trigger">{open ? <X size={18} /> : <Search size={18} />}</button>
    {open && <div className="header-search-panel">
      <input ref={inputRef} value={term} onChange={event => setTerm(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && trimmed) goToShop(); }} placeholder="Бүтээгдэхүүн, брэндээр хайх" className="header-search-input" />
      {results}
    </div>}
  </div>;
}
