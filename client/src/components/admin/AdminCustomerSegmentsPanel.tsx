import { genderLabels, skinTypeLabels as customerSkinTypeLabels, hairTypeLabels, skinConcernOptions } from "@shared/catalog-filter";
import type { RouterOutputs } from "@/lib/trpc";

export type PreferenceSegments = RouterOutputs["admin"]["customerSegments"]["preferenceSegments"];
export type SegmentField = "gender" | "skinType" | "skinConcerns" | "hairType" | "primaryDistrict" | "hasYoungChildren";

// Lifted as-is from AdminAnalyticsPanel.tsx (Admin overhaul, 2026-09-08,
// Phase I) -- "concern" here is this component's own UI-label grouping key
// (topSkinConcerns), distinct from the server's "skinConcerns" field key
// usersBySegment (server/analytics.ts) actually expects; onSegmentFieldFor
// below bridges the two.
const preferenceSegmentLabelFor = (field: "gender" | "skinType" | "hairType" | "concern", value: string): string => {
  if (field === "gender") return genderLabels[value as keyof typeof genderLabels] ?? value;
  if (field === "skinType") return customerSkinTypeLabels[value as keyof typeof customerSkinTypeLabels] ?? value;
  if (field === "hairType") return hairTypeLabels[value as keyof typeof hairTypeLabels] ?? value;
  return skinConcernOptions.find(option => option.value === value)?.label ?? value;
};
const onSegmentFieldFor = (uiField: "gender" | "skinType" | "hairType" | "concern"): SegmentField => uiField === "concern" ? "skinConcerns" : uiField;

/**
 * Admin overhaul (2026-09-08, Phase I): extracted from AdminAnalyticsPanel's
 * "Тохиргооны сегмент" section (byte-for-byte the same markup, just
 * parameterized) so it can be reused by both the unchanged finance Analytics
 * page and marketing's new Campaigns surface (Phase J). Read-only when
 * `onSelectSegment` is omitted -- exactly finance's existing behavior, since
 * usersBySegment (the drill-down this callback leads to) is
 * marketingProcedure-only and finance never gets it even though this
 * component is shared.
 */
export default function AdminCustomerSegmentsPanel({ preferenceSegments, onSelectSegment }: {
  preferenceSegments: PreferenceSegments;
  onSelectSegment?: (field: SegmentField, value: string, label: string) => void;
}) {
  return (
    <section className="min-w-0 rounded-3xl border border-black/7 p-5">
      <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Тохиргооны сегмент</h3>
      <p className="mt-1 text-xs text-[#8a8b8f]">Профайл дээрээ гоо сайхны/гэрийн тохиргоо бөглөсөн харилцагчид.{onSelectSegment && " Тоо дээр дарж тухайн бүлгийн харилцагчдыг харна уу."}</p>
      {preferenceSegments.totalCustomerCount === 0 ? (
        <p className="mt-4 text-sm text-[#77787d]">Одоогоор бүртгэлтэй харилцагч алга.</p>
      ) : (
        <div className="mt-4 grid gap-4">
          {([
            { title: "Хүйс", field: "gender" as const, provided: preferenceSegments.genderProvidedCount, rows: preferenceSegments.genderBreakdown },
            { title: "Арьсны төрөл", field: "skinType" as const, provided: preferenceSegments.skinTypeProvidedCount, rows: preferenceSegments.skinTypeBreakdown },
            { title: "Санаа зовдог асуудал (эхний 10)", field: "concern" as const, provided: preferenceSegments.topSkinConcerns.reduce((sum, row) => sum + row.count, 0), rows: preferenceSegments.topSkinConcerns },
            { title: "Үсний төрөл", field: "hairType" as const, provided: preferenceSegments.hairTypeProvidedCount, rows: preferenceSegments.hairTypeBreakdown },
          ]).map(group => group.rows.length > 0 && (
            <div key={group.title}>
              <p className="text-[11px] font-bold text-[#55565b]">{group.title} <span className="font-normal text-[#8a8b8f]">({group.provided} / {preferenceSegments.totalCustomerCount})</span></p>
              <ul className="mt-1.5 grid gap-1">
                {group.rows.map(row => {
                  const label = preferenceSegmentLabelFor(group.field, row.value);
                  return (
                    <li key={row.value} className="flex items-center justify-between border-b border-black/6 py-1 text-sm">
                      {onSelectSegment ? (
                        <button type="button" onClick={() => onSelectSegment(onSegmentFieldFor(group.field), row.value, label)} className="text-left underline decoration-dotted underline-offset-2 hover:text-[#df1f3d]">{label}</button>
                      ) : <span>{label}</span>}
                      <strong className="text-[#17181b]">{row.count}</strong>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {preferenceSegments.districtBreakdown.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#55565b]">Дүүрэг <span className="font-normal text-[#8a8b8f]">({preferenceSegments.districtProvidedCount} / {preferenceSegments.totalCustomerCount})</span></p>
              <ul className="mt-1.5 grid gap-1">
                {preferenceSegments.districtBreakdown.map(row => (
                  <li key={row.district} className="flex items-center justify-between border-b border-black/6 py-1 text-sm">
                    {onSelectSegment ? (
                      <button type="button" onClick={() => onSelectSegment("primaryDistrict", row.district, row.label)} className="text-left underline decoration-dotted underline-offset-2 hover:text-[#df1f3d]">{row.label}</button>
                    ) : <span>{row.label}</span>}
                    <strong className="text-[#17181b]">{row.count}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preferenceSegments.hasYoungChildrenCount > 0 && (
            onSelectSegment ? (
              <p className="text-sm"><button type="button" onClick={() => onSelectSegment("hasYoungChildren", "true", "Бага насны хүүхэдтэй")} className="text-left underline decoration-dotted underline-offset-2 hover:text-[#df1f3d]">Бага насны хүүхэдтэй</button>: <strong>{preferenceSegments.hasYoungChildrenCount}</strong></p>
            ) : (
              <p className="text-sm">Бага насны хүүхэдтэй: <strong>{preferenceSegments.hasYoungChildrenCount}</strong></p>
            )
          )}
        </div>
      )}
    </section>
  );
}
