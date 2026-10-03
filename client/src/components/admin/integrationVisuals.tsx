import { CreditCard, MessagesSquare, Receipt, Smartphone, Store, Truck, Wallet, type LucideIcon } from "lucide-react";
import type { IntegrationAccent, IntegrationIcon, IntegrationMeta } from "@shared/integrations";

/**
 * The bridge between a provider's declared identity and what React draws
 * (2026-09-15). shared/integrations.ts stores only string keys -- it is
 * imported by server/db.ts, so a lucide component or a hex colour there would
 * either drag React into the server bundle or bypass the admin's dark-mode
 * tokens. Resolving both here keeps that module free of either.
 */
export const INTEGRATION_ICON: Record<IntegrationIcon, LucideIcon> = {
  receipt: Receipt,
  wallet: Wallet,
  card: CreditCard,
  truck: Truck,
  phone: Smartphone,
  store: Store,
  chat: MessagesSquare,
};

export const INTEGRATION_ACCENT: Record<IntegrationAccent, { color: string; soft: string }> = {
  amber: { color: "var(--a-warn)", soft: "var(--a-warn-soft)" },
  blue: { color: "var(--a-info)", soft: "var(--a-info-soft)" },
  green: { color: "var(--a-pos)", soft: "var(--a-pos-soft)" },
  violet: { color: "var(--a-accent-violet)", soft: "var(--a-accent-violet-soft)" },
  slate: { color: "var(--a-text-soft)", soft: "var(--a-soft)" },
};

export type IntegrationStatus = { label: string; className: string };

/**
 * One pill per card, replacing two signals the old screen conflated: the
 * active toggle doubled as the status, so "configured but switched off" and
 * "nothing saved at all" looked identical, and a provider with no runtime
 * code explained itself in a paragraph of warning text instead.
 */
export function integrationStatus(meta: IntegrationMeta, row: { decryptFailed: boolean; configuredKeys: string[]; isActive: boolean }): IntegrationStatus {
  if (row.decryptFailed) return { label: "Тайлагдахгүй", className: "bg-[var(--a-neg-soft)] text-[var(--a-neg)]" };
  if (!meta.wiredUp) return { label: "Кодонд холбогдоогүй", className: "bg-[var(--a-warn-soft)] text-[var(--a-warn)]" };
  if (!row.configuredKeys.length) return { label: "Холбоогүй", className: "bg-[var(--a-soft)] text-[var(--a-muted)]" };
  if (!row.isActive) return { label: "Тохируулсан · идэвхгүй", className: "bg-[var(--a-info-soft)] text-[var(--a-info)]" };
  return { label: "Идэвхтэй", className: "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" };
}

/** Icon tile + name + one-line note + status pill, shared by every card. */
export function IntegrationCardHeader({ meta, status, accentKey, iconKey }: { meta: { label: string; note: string }; status: IntegrationStatus; accentKey: IntegrationAccent; iconKey: IntegrationIcon }) {
  const accent = INTEGRATION_ACCENT[accentKey];
  const Icon = INTEGRATION_ICON[iconKey];
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ background: accent.soft, color: accent.color }}>
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="font-bold leading-tight">{meta.label}</h3>
          <p className="mt-0.5 text-xs leading-4 text-[var(--a-muted)]">{meta.note}</p>
        </div>
      </div>
      <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-extrabold ${status.className}`}>{status.label}</span>
    </div>
  );
}
