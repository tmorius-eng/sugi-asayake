/**
 * The 3-number "800+ / 03 / 01" strip directly under the hero. Extracted
 * from the old inline Home.tsx (Tier 2 of the home redesign).
 *
 * Per-number honesty (see docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md
 * and the approved plan):
 *  - "800+" and "Японы албан ёсны эрх" stay static reviewed brand facts,
 *    not live-queried vanity numbers (no loading/skeleton state for one
 *    number is worth adding).
 *  - the branch count is passed in as `branchCount` (Home.tsx derives it
 *    from the same `locations` data the store locator renders) instead of
 *    being a second hand-typed "3" -- if a branch is ever added or removed
 *    this number can't silently drift from the actual locator list.
 *
 * The 3 labels beside each number are admin-editable via useSiteText (see
 * shared/site-text.ts) -- the numbers themselves stay code.
 */
import { useSiteText } from "@/hooks/useSiteText";
export default function TrustStrip({ branchCount }: { branchCount: number }) {
  const textFor = useSiteText();
  const branchLabel = String(branchCount).padStart(2, "0");
  return (
    <div className="hero-facts" aria-label="SUGI ASAYAKE facts">
      {/* "800+" itself stays code (real product-count fact repeated in
          several homepage sections -- see shared/site-text.ts's header
          comment); only the labels beside each number are text slots. */}
      <div><strong>800<span>+</span></strong><span>{textFor("home-text-trust-stat1-label", "төрлийн бүтээгдэхүүн")}</span></div>
      <div><strong>{branchLabel}</strong><span>{textFor("home-text-trust-stat2-label", "УБ дахь салбар")}</span></div>
      <div><strong>{textFor("home-text-trust-stat3-value", "01")}</strong><span>{textFor("home-text-trust-stat3-label", "Японы албан ёсны эрх")}</span></div>
    </div>
  );
}
