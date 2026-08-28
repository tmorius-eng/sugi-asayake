import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { LOYALTY_TIERS } from "@shared/loyalty";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import SectionHeading from "./SectionHeading";
import InfinityGraph from "./InfinityGraph";

const formatMnt = (amount: number) => `${new Intl.NumberFormat("mn-MN").format(amount)}₮`;
const MAX_DISCOUNT_PERCENT = Math.max(...LOYALTY_TIERS.map((tier) => tier.discountPercent));

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

  return (
    <section className="qs-section" data-reveal aria-label="Гишүүнчлэлийн хураангуй">
      <div className="qs-grid">
        <div className="qs-copy">
          <p className="eyebrow"><span /> ГИШҮҮНЧЛЭЛ · QUICK STATS</p>
          <SectionHeading>Илүү их худалдан авалт,<br /><em>илүү их хэмнэлт.</em></SectionHeading>
          <p className="qs-desc">Таны нийт худалдан авалтын дүн өсөх тусам гишүүнчлэлийн хямдрал нэмэгдэж, дараагийн захиалга бүрд илүү их хэмнэлт үүснэ.</p>

          {!user && !authLoading && (
            <p className="eyebrow">Нэвтэрснээр өөрийн хэмнэлтийг харах боломжтой</p>
          )}

          {user && statusQuery.data && (
            <div className="qs-meta">
              <div className="qs-meta-row"><span>Одоогийн зэрэглэл</span><strong>{statusQuery.data.currentTier.name}</strong></div>
              <div className="qs-meta-row">
                <span>Дараагийн зэрэглэл</span>
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
            <Link href="/profile?tab=loyalty" className="qs-cta">Профайл руу орох <ArrowUpRight size={15} /></Link>
          ) : (
            <Link href="/login?mode=register" className="qs-cta">Гишүүнээр бүртгүүлэх <ArrowUpRight size={15} /></Link>
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
            const rightRatio = MAX_DISCOUNT_PERCENT > 0 ? status.currentTier.discountPercent / MAX_DISCOUNT_PERCENT : 0;
            const nextTierSummary = status.nextTier
              ? `дараагийн "${status.nextTier.name}" зэрэглэлд хүрэхэд ${formatMnt(status.amountToNextTierMnt ?? 0)} дутуу байна`
              : "хамгийн дээд зэрэглэлд хүрсэн байна";
            return (
              <>
                <InfinityGraph
                  leftRatio={leftRatio}
                  leftValue={formatMnt(status.totalSpendMnt)}
                  leftLabel="Нийт худалдан авалт"
                  rightRatio={rightRatio}
                  rightValue={`${status.currentTier.discountPercent}%`}
                  rightLabel="Одоогийн хөнгөлөлт"
                />
                <div className="qs-savings">
                  <strong>{formatMnt(status.totalLoyaltySavingsMnt)}</strong>
                  <span>Нийт хэмнэсэн дүн</span>
                </div>
                <p className="qs-sr-summary">
                  Таны гишүүнчлэл: {status.currentTier.name} зэрэглэл, одоогийн хөнгөлөлт {status.currentTier.discountPercent}%, нийт худалдан авалт {formatMnt(status.totalSpendMnt)}, нийт хэмнэсэн дүн {formatMnt(status.totalLoyaltySavingsMnt)}, {nextTierSummary}.
                </p>
              </>
            );
          })()}

          {!user && !authLoading && (
            <div className="qs-guest-tiers">
              {LOYALTY_TIERS.map((tier) => (
                <div className="qs-guest-tier" key={tier.name}>
                  <strong>{tier.discountPercent}%</strong>
                  <span>{tier.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
