import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { LOYALTY_TIERS, getLoyaltyTier, getNextLoyaltyTier } from "@shared/loyalty";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useSiteText } from "@/hooks/useSiteText";
import { useT } from "@/hooks/useLocale";
import SectionHeading from "./SectionHeading";
import InfinityGraph from "./InfinityGraph";
import { formatMnt } from "@shared/format";

// Master-prompt section 16.7 explicitly suggests a compact form for the
// infinity graph's loop-center value ("actual eligible lifetime spend, for
// example: '₮1.2M'") -- the full formatMnt() precision is kept everywhere
// else (qs-savings, meta rows, the sr-only summary), just not inside the
// ~130px-wide loop-center label where a full 7-digit number was crowding
// the ring.
const formatMntCompact = (amount: number) => {
  if (Math.abs(amount) >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `${millions.toFixed(millions % 1 === 0 ? 0 : 1)}M₮`;
  }
  if (Math.abs(amount) >= 1_000) {
    const thousands = amount / 1_000;
    return `${thousands.toFixed(thousands % 1 === 0 ? 0 : 1)}K₮`;
  }
  return formatMnt(amount);
};
// Guests see the same infinity graph rather than a plain tier grid (that
// mismatch was why the live page looked nothing like the reference when
// logged out). The example is *computed from the real tier table* via
// shared/loyalty.ts's own functions rather than hand-typed, and is labelled
// "ЖИШЭЭ ХАРУУЛАЛТ" on screen, so it is never mistaken for the visitor's
// own data -- the master prompt allows numbers that are "clearly labeled as
// example/public data".
//
// 2026-09-12: that "real tier table" is now the admin-editable
// `loyalty_tiers` table, so the example is derived per render from the live
// ladder instead of from module constants frozen at build time -- otherwise
// raising the top discount in /admin would leave the homepage still
// advertising the old percentage as the reason to sign up.
const EXAMPLE_SPEND_MNT = 600_000;

/**
 * Tier 7 of the home redesign, and the section the master prompt is
 * strictest about: replaces the old "Quick Stats" hardcoded-number idea
 * with a real, server-authoritative membership summary. See
 * docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md section 16 and
 * server/db.ts's getUserLoyaltyStatus (source of every number here).
 *
 * Three metrics stay visually and mathematically distinct, never merged
 * into one misleading number (master prompt section 16.3):
 *  1. left loop  -- membership progress toward the next tier (spend-based)
 *  2. right loop -- current loyalty discount rate (currentTier.discountPercent)
 *  3. a plain number, not a loop -- totalLoyaltySavingsMnt, real money saved
 *
 * Guest visitors never see personal numbers: only the public tier table
 * (imported directly from shared/loyalty.ts, never redefined here) and a
 * login/register CTA. An error loading the authenticated status renders an
 * honest "тодорхойгүй байна" state, never a silent ₮0/0%.
 */
export default function QuickStatsSection() {
  const { user, loading: authLoading } = useAuth();
  const statusQuery = trpc.loyalty.myStatus.useQuery(undefined, { enabled: Boolean(user) });
  // Falls back to the code constant while the request is in flight -- the
  // same list the server itself falls back to -- so the guest example never
  // flashes an empty ladder.
  const tiersQuery = trpc.content.loyaltyTiers.useQuery();
  const tiers = tiersQuery.data ?? LOYALTY_TIERS;
  const example = useMemo(() => {
    const maxDiscountPercent = Math.max(0, ...tiers.map(tier => tier.discountPercent));
    const tier = getLoyaltyTier(EXAMPLE_SPEND_MNT, tiers);
    const nextTier = getNextLoyaltyTier(EXAMPLE_SPEND_MNT, tiers);
    return {
      maxDiscountPercent,
      tier,
      nextTier,
      leftRatio: nextTier && nextTier.minSpendMnt > 0 ? EXAMPLE_SPEND_MNT / nextTier.minSpendMnt : 1,
      rightRatio: maxDiscountPercent > 0 ? tier.discountPercent / maxDiscountPercent : 0,
    };
  }, [tiers]);
  const textFor = useSiteText();
  const t = useT();
  const [headingLine1, headingLine2] = textFor("home-text-qs-heading", "Quick\nStats").split("\n");

  return (
    <section className="qs-section" id="membership" data-reveal aria-label="Гишүүнчлэлийн хураангуй">
      <div className="qs-grid">
        <div className="qs-copy">
          <p className="eyebrow"><span /> {textFor("home-text-qs-eyebrow-label", "ГИШҮҮНЧЛЭЛ")}</p>
          {/* "Quick Stats" stays the actual heading, matching the reference
              image's own two-line display heading -- the master prompt
              (section 16.5) asks to preserve that visual and add Mongolian
              alongside it, not to replace it with a Mongolian phrase. The
              Mongolian explanatory line sits directly beneath. Both lines
              are admin-editable (shared/site-text.ts), still defaulting to
              exactly this English/Mongolian pairing. */}
          <SectionHeading>{headingLine1}<br /><em>{headingLine2}</em></SectionHeading>
          <p className="qs-subtitle">{textFor("home-text-qs-subtitle", "Илүү их худалдан авалт, илүү их хэмнэлт.")}</p>
          <p className="qs-desc">{textFor("home-text-qs-description", "Таны нийт худалдан авалтын дүн өсөх тусам гишүүнчлэлийн хямдрал нэмэгдэж, дараагийн захиалга бүрд илүү их хэмнэлт үүснэ.")}</p>

          {!user && !authLoading && (
            <p className="eyebrow">{textFor("home-text-qs-guest-hint", "Нэвтэрснээр өөрийн бодит хэмнэлтийг харах боломжтой")}</p>
          )}

          {user && statusQuery.data && (
            <div className="qs-meta">
              <div className="qs-meta-row"><span>{t("Одоогийн зэрэглэл")}</span><strong>{t(statusQuery.data.currentTier.name)}</strong></div>
              <div className="qs-meta-row">
                <span>{t("Дараагийн зэрэглэл")}</span>
                <strong>
                  {statusQuery.data.nextTier
                    ? `${statusQuery.data.nextTier.name} — ${formatMnt(statusQuery.data.amountToNextTierMnt ?? 0)} дутуу`
                    : "Хамгийн дээд шат"}
                </strong>
              </div>
            </div>
          )}
          {user && statusQuery.isError && (
            <p className="qs-unavailable">Гишүүнчлэлийн мэдээлэл одоогоор ачаалагдсангүй.</p>
          )}

          {user ? (
            <Link href="/profile?tab=loyalty" className="qs-cta">{textFor("home-text-qs-cta-loggedin", "Профайл руу орох")} <ArrowUpRight size={15} /></Link>
          ) : (
            <Link href="/login?mode=register" className="qs-cta">{textFor("home-text-qs-cta-guest", "Гишүүнээр бүртгүүлэх")} <ArrowUpRight size={15} /></Link>
          )}
        </div>

        <div className="qs-stage">
          {(authLoading || (user && statusQuery.isLoading)) && <div className="qs-skeleton-block" aria-hidden="true" />}

          {user && statusQuery.isError && (
            <p className="qs-unavailable">Гишүүнчлэлийн график ачаалж чадсангүй.</p>
          )}

          {user && statusQuery.data && (() => {
            const status = statusQuery.data;
            const leftRatio = status.nextTier ? status.totalSpendMnt / status.nextTier.minSpendMnt : 1;
            const rightRatio = example.maxDiscountPercent > 0 ? status.currentTier.discountPercent / example.maxDiscountPercent : 0;
            // Built from a translated template rather than concatenated, so
            // it reads correctly in English and Japanese too.
            const nextTierSummary = status.nextTier
              ? t('дараагийн "{tier}" зэрэглэлд хүрэхэд {left} дутуу байна')
                  .replace("{tier}", t(status.nextTier.name))
                  .replace("{left}", formatMnt(status.amountToNextTierMnt ?? 0))
              : t("хамгийн дээд зэрэглэлд хүрсэн байна");
            return (
              <>
                <InfinityGraph
                  leftRatio={leftRatio}
                  leftValue={formatMntCompact(status.totalSpendMnt)}
                  leftLabel="Нийт худалдан авалт"
                  rightRatio={rightRatio}
                  rightValue={`${status.currentTier.discountPercent}%`}
                  rightLabel={t("Одоогийн хөнгөлөлт")}
                />
                <div className="qs-savings">
                  <strong>{formatMnt(status.totalLoyaltySavingsMnt)}</strong>
                  <span>Нийт хэмнэсэн дүн</span>
                </div>
                <p className="qs-sr-summary">
                  {`Таны гишүүнчлэл: ${status.currentTier.name} зэрэглэл, одоогийн хөнгөлөлт ${status.currentTier.discountPercent}%, нийт худалдан авалт ${formatMnt(status.totalSpendMnt)}, нийт хэмнэсэн дүн ${formatMnt(status.totalLoyaltySavingsMnt)}, ${nextTierSummary}.`}
                </p>
              </>
            );
          })()}

          {!user && !authLoading && (
            <>
              <p className="qs-example-tag">{t("ЖИШЭЭ ХАРУУЛАЛТ")}</p>
              <InfinityGraph
                leftRatio={example.leftRatio}
                leftValue={formatMntCompact(EXAMPLE_SPEND_MNT)}
                leftLabel={t("Жишээ: нийт худалдан авалт")}
                rightRatio={example.rightRatio}
                rightValue={`${example.tier.discountPercent}%`}
                rightLabel={t("Жишээ: хөнгөлөлт")}
              />
              <p className="qs-example-note">
                {example.nextTier
                  ? t('Жишээ нь: {spend} худалдан авалттай гишүүн "{tier}" зэрэглэлд {discount}% хөнгөлөлт эдэлж, "{next}" зэрэглэл хүртэл {left} дутуу байна.')
                      .replace("{spend}", formatMnt(EXAMPLE_SPEND_MNT))
                      .replace("{tier}", t(example.tier.name))
                      .replace("{discount}", String(example.tier.discountPercent))
                      .replace("{next}", t(example.nextTier.name))
                      .replace("{left}", formatMnt(Math.max(0, example.nextTier.minSpendMnt - EXAMPLE_SPEND_MNT)))
                  : t('Жишээ нь: {spend} худалдан авалттай гишүүн "{tier}" зэрэглэлд {discount}% хөнгөлөлт эдэлнэ.')
                      .replace("{spend}", formatMnt(EXAMPLE_SPEND_MNT))
                      .replace("{tier}", t(example.tier.name))
                      .replace("{discount}", String(example.tier.discountPercent))}
              </p>
              <div className="qs-guest-tiers">
                {tiers.map((tier) => (
                  <div className="qs-guest-tier" key={tier.name}>
                    <strong>{tier.discountPercent}%</strong>
                    <span>{tier.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
