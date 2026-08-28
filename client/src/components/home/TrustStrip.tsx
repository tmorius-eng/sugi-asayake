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
 */
export default function TrustStrip({ branchCount }: { branchCount: number }) {
  const branchLabel = String(branchCount).padStart(2, "0");
  return (
    <div className="hero-facts" aria-label="SUGI ASAYAKE facts">
      <div><strong>800<span>+</span></strong><span>төрлийн бүтээгдэхүүн</span></div>
      <div><strong>{branchLabel}</strong><span>УБ дахь салбар</span></div>
      <div><strong>01</strong><span>Японы албан ёсны эрх</span></div>
    </div>
  );
}
