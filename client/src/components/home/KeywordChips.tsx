import { Link } from "wouter";
import { useSiteText } from "@/hooks/useSiteText";

/**
 * "Түгээмэл хайлт" -- the reference's 人気キーワード block that sits right
 * under the opening photographs: a cream, hairline-bordered box with a
 * centred title and a cloud of pill links. Here the pills are the six real
 * catalogue categories followed by the admin's featured brands, each a
 * real /shop filter -- nothing is a made-up keyword. Hidden entirely when
 * there is nothing to link to.
 */
export default function KeywordChips({ categories, brands }: {
  categories: { slug: string; name: string }[];
  brands: { id: number; brandName: string }[];
}) {
  const textFor = useSiteText();
  const chips = [
    ...categories.map(category => ({ key: `c-${category.slug}`, label: category.name, href: `/shop?category=${encodeURIComponent(category.name)}` })),
    ...brands.map(brand => ({ key: `b-${brand.id}`, label: brand.brandName, href: `/shop?q=${encodeURIComponent(brand.brandName)}` })),
  ];
  if (chips.length === 0) return null;
  return (
    <section className="kw-section" data-reveal aria-labelledby="kw-title">
      <div className="kw-box">
        <h2 id="kw-title">{textFor("home-text-keywords-heading", "Түгээмэл хайлт")}</h2>
        <ul className="kw-list">
          {chips.map(chip => <li key={chip.key}><Link href={chip.href} className="kw-chip">{chip.label}</Link></li>)}
        </ul>
      </div>
    </section>
  );
}
