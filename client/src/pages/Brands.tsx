import { useMemo, useState } from "react";
import { Link } from "wouter";
import { LoaderCircle, Search, X } from "lucide-react";
import CommerceHeader from "@/components/CommerceHeader";
import SiteFooter from "@/components/SiteFooter";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { trpc } from "@/lib/trpc";
import { useSiteText } from "@/hooks/useSiteText";
import { brandName } from "@/lib/brand";

/**
 * /brands -- the "Бүх брэнд үзэх" destination the Featured Brands carousel
 * links to, rebuilt against matsuyaginza.com/en/brands (Tom, 2026-09-10:
 * "ene talaa ijilhen bolgo! brand name eer haidag search bar edrtei bas A-Z
 * hurtel brandiin neriig harah songoltoi").
 *
 * The reference's structure, which this follows: a sticky left rail holding a
 * brand-name search box and an A-Z grid whose unavailable letters are greyed
 * out, and a right-hand area of letter-grouped cards -- each card a bordered
 * square holding the brand's mark, with the brand name underneath.
 *
 * Two honest departures, both forced by the data rather than taste:
 *  - Only featured brands have a logo uploaded (see featured_brands.logoUrl);
 *    the other ~160 have none and there is no way to invent one. A card
 *    without a logo sets the brand NAME in the square as a wordmark, so the
 *    grid still reads as a grid instead of a row of empty boxes.
 *  - The reference's ONLINE/STORE toggles have no equivalent here: this
 *    catalogue has no per-brand in-store flag, so a control for it would be
 *    decoration that filters nothing.
 *
 * Grouping uses a "0-9" bucket, A-Z, then "#" for anything else (the catalogue
 * really does contain names like "(8)Silk"), matching the reference's own
 * "0-9"-first ordering. Sorting is `localeCompare(..., "mn")` because these
 * names mix Latin and Cyrillic and MySQL's collation order is not what a
 * reader scanning an index expects.
 */
type DirectoryBrand = { brandName: string; productCount: number; logoUrl: string | null; isFeatured: boolean };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const DIGITS_BUCKET = "0-9";
const OTHER_BUCKET = "#";

function bucketFor(name: string): string {
  const first = name.trim().charAt(0).toLocaleUpperCase("mn");
  if (/[0-9]/.test(first)) return DIGITS_BUCKET;
  if (LETTERS.includes(first)) return first;
  return OTHER_BUCKET;
}

export default function Brands() {
  const textFor = useSiteText();
  useDocumentMeta(
    textFor("seo-text-brands-title", `Бүх брэнд — ${brandName()}`),
    textFor("seo-text-brands-description", `${brandName()}-д худалдаалагдаж буй Японы бүх брэндийн жагсаалт.`),
  );
  const directoryQuery = trpc.catalog.brandDirectory.useQuery();
  const brands: DirectoryBrand[] = useMemo(() => directoryQuery.data ?? [], [directoryQuery.data]);
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState<string | null>(null);

  // Which buckets actually contain something -- drives the greyed-out letters.
  const available = useMemo(() => new Set(brands.map(brand => bucketFor(brand.brandName))), [brands]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("mn");
    return brands.filter(brand => {
      if (letter && bucketFor(brand.brandName) !== letter) return false;
      return !needle || brand.brandName.toLocaleLowerCase("mn").includes(needle);
    });
  }, [brands, query, letter]);

  const groups = useMemo(() => {
    const bucket = new Map<string, DirectoryBrand[]>();
    for (const brand of visible) {
      const key = bucketFor(brand.brandName);
      const existing = bucket.get(key);
      if (existing) existing.push(brand);
      else bucket.set(key, [brand]);
    }
    // "0-9" first, then A-Z, then "#" -- the reference's own ordering.
    const order = [DIGITS_BUCKET, ...LETTERS, OTHER_BUCKET];
    return order.filter(key => bucket.has(key)).map(key => ({ letter: key, rows: bucket.get(key)! }));
  }, [visible]);

  const railLetters = [DIGITS_BUCKET, ...LETTERS, ...(available.has(OTHER_BUCKET) ? [OTHER_BUCKET] : [])];

  return (
    <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]">
      <CommerceHeader />
      <main className="brands-page">
        <header className="brands-intro">
          <h1>{textFor("brands-text-heading", "Бүх брэнд")}</h1>
          {!directoryQuery.isLoading && brands.length > 0 && (
            <p>{brands.length} брэнд · {brands.reduce((sum, brand) => sum + brand.productCount, 0).toLocaleString("mn-MN")} бүтээгдэхүүн</p>
          )}
        </header>

        <div className="brands-layout">
          <aside className="brands-rail">
            <div className="brands-search">
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="БРЭНДИЙН НЭР"
                aria-label="Брэндийн нэрээр хайх"
              />
              {query
                ? <button type="button" onClick={() => setQuery("")} aria-label="Хайлт цэвэрлэх"><X size={16} /></button>
                : <Search size={16} aria-hidden="true" />}
            </div>

            <nav className="brands-letters" aria-label="Үсгээр шүүх">
              {railLetters.map(key => {
                const enabled = available.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!enabled}
                    aria-pressed={letter === key}
                    onClick={() => setLetter(current => (current === key ? null : key))}
                    className={letter === key ? "is-active" : undefined}
                  >
                    {key}
                  </button>
                );
              })}
            </nav>

            {(letter || query) && (
              <button type="button" className="brands-reset" onClick={() => { setLetter(null); setQuery(""); }}>
                Шүүлтүүр цэвэрлэх
              </button>
            )}
          </aside>

          <div className="brands-results">
            {directoryQuery.isLoading && (
              <p className="brands-status"><LoaderCircle className="animate-spin" size={16} /> Уншиж байна…</p>
            )}
            {!directoryQuery.isLoading && visible.length === 0 && (
              <p className="brands-status">Хайлтад тохирох брэнд олдсонгүй.</p>
            )}

            {groups.map(group => (
              <section key={group.letter} className="brands-group">
                <h2>{group.letter}</h2>
                <ul>
                  {group.rows.map(brand => (
                    <li key={brand.brandName}>
                      <Link href={`/shop?brand=${encodeURIComponent(brand.brandName)}`} className="brand-card">
                        <span className="brand-card-mark">
                          {brand.logoUrl
                            ? <img src={brand.logoUrl} alt="" loading="lazy" />
                            : <em>{brand.brandName}</em>}
                        </span>
                        <strong>{brand.brandName}</strong>
                        <span className="brand-card-count">{brand.productCount} бараа</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
