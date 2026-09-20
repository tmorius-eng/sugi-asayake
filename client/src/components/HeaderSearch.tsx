import { useEffect, useRef, useState } from "react";
import { Search, Tag, X } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";
import { useProductName } from "@/hooks/useProductName";

// Site-wide search-with-suggestions, reachable from every page (previously
// the only search box lived inside /shop's hero panel -- a shopper on Home,
// ProductDetail, or Profile had no way to search without first navigating
// there).
//
// Хайлт v3 (2026-09-20): `catalog.suggest` — /shop-ийн `catalog.search`-тэй
// ЯГ ИЖИЛ индекс (server/search/catalogSearch.ts), дээр нь брэнд/ангиллын
// мөр ("Брэнд: PRIECLAT · 21") ба "Та … гэж хайсан уу?" санал. Ингэснээр энд
// харагдсан зүйл /shop дээр ч олдоно — 2026-08-25-ны "хоёр өөр хайлт" зөрүү
// дахин үүсэхгүй.
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
  const displayName = useProductName();
  const trimmed = term.trim();

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedTerm(trimmed), 300);
    return () => clearTimeout(handle);
  }, [trimmed]);

  const isSearchable = open && debouncedTerm.length >= MIN_QUERY_LENGTH;
  const search = trpc.catalog.suggest.useQuery({ query: debouncedTerm }, { enabled: isSearchable });
  const matches = search.data?.products ?? [];
  const brandMatches = search.data?.brandMatches ?? [];
  const categoryMatches = search.data?.categoryMatches ?? [];
  const didYouMean = search.data?.didYouMean ?? null;
  const hasAnything = matches.length > 0 || brandMatches.length > 0 || categoryMatches.length > 0;

  useEffect(() => { if (open && variant === "icon") inputRef.current?.focus(); }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const goToShop = (query = trimmed) => {
    setOpen(false);
    window.location.assign(`/shop?q=${encodeURIComponent(query)}`);
  };
  const goToBrand = (brand: string) => {
    setOpen(false);
    window.location.assign(`/shop?brand=${encodeURIComponent(brand)}`);
  };
  const goToCategory = (name: string) => {
    setOpen(false);
    window.location.assign(`/shop?category=${encodeURIComponent(name)}`);
  };

  const results = (
    <>
      {trimmed ? <div className="header-search-results">
        {trimmed.length < MIN_QUERY_LENGTH ? <p className="header-search-empty">{`Дор хаяж ${MIN_QUERY_LENGTH} тэмдэгт оруулна уу.`}</p> : search.isLoading || debouncedTerm !== trimmed ? <p className="header-search-empty">Хайж байна…</p> : hasAnything ? <>
          {/* <a>, БИШ <button>: утасны толгойд (.commerce-header-actions) "button span" бүгд
              display:none (3100-р мөрийн дүрс-товчны дүрэм) — товчоор бичихэд брэндийн мөр
              утсан дээр хоосон харагдаж байсныг 2026-09-20-нд screenshot-оор олов. */}
          {brandMatches.map(match => <a key={`b-${match.brand}`} href={`/shop?brand=${encodeURIComponent(match.brand)}`} onClick={event => { event.preventDefault(); goToBrand(match.brand); }} className="header-search-result header-search-facet">
            <span className="header-search-facet-icon"><Tag size={15} /></span>
            <span><strong>{`Брэнд: ${match.brand}`}</strong><small>{`${match.count} бараа`}</small></span>
          </a>)}
          {categoryMatches.map(match => <a key={`c-${match.name}`} href={`/shop?category=${encodeURIComponent(match.name)}`} onClick={event => { event.preventDefault(); goToCategory(match.name); }} className="header-search-result header-search-facet">
            <span className="header-search-facet-icon"><Search size={15} /></span>
            <span><strong>{`Ангилал: ${match.name}`}</strong><small>Бүх барааг харах</small></span>
          </a>)}
          {matches.map(product => {
            const name = displayName(product);
            return <Link key={product.id} href={`/product/${product.slug}`} onClick={() => setOpen(false)} className="header-search-result">
              <img src={product.imageUrl ?? fallbackImage} alt="" />
              <span><strong>{name.primary}</strong>{name.secondary ? <em className="header-search-secondary">{name.secondary}</em> : null}<small>{formatMnt(product.priceMnt)}</small></span>
            </Link>;
          })}
          {didYouMean ? <button type="button" onClick={() => { setTerm(didYouMean); setDebouncedTerm(didYouMean); }} className="header-search-didyoumean">{`Та “${didYouMean}” гэж хайсан уу?`}</button> : null}
          <button type="button" onClick={() => goToShop()} className="header-search-viewall">{`“${trimmed}” -г бүх дэлгүүрээс харах →`}</button>
        </> : <>
          <p className="header-search-empty">Тохирох бүтээгдэхүүн олдсонгүй.</p>
          {didYouMean ? <button type="button" onClick={() => { setTerm(didYouMean); setDebouncedTerm(didYouMean); }} className="header-search-didyoumean">{`Та “${didYouMean}” гэж хайсан уу?`}</button> : null}
        </>}
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
