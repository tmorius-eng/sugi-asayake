import { useState } from "react";
import type { AdminSection } from "./AdminWorkspace";
import ProcessChainBoard from "./admin/process/ProcessChainBoard";
import ProcessHumanQueue from "./admin/process/ProcessHumanQueue";
import ProcessOrderTrail from "./admin/process/ProcessOrderTrail";
import ProcessJobsAndAudit from "./admin/process/ProcessJobsAndAudit";

type Tab = "chain" | "trail" | "jobs";

/**
 * /admin → Процесс (2026-10-05): захиалгын бодит гинжийг (хүлээгдэж буй → дууссан)
 * алхам бүрээр нь, хэн хийснийг нь харуулдаг самбар. Зөвхөн унших — шийдвэр
 * гаргах дэлгэцүүд рүү холбоосоор л хөтөлнө.
 */
export default function AdminProcessPanel({ role, onNavigate, onSearchIn }: {
  role: string;
  onNavigate: (section: AdminSection) => void;
  onSearchIn: (section: AdminSection, query: string) => void;
}) {
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<Tab>(() => new URLSearchParams(window.location.search).get("orderId") ? "trail" : "chain");
  const [trailOrderId, setTrailOrderId] = useState<number | null>(() => {
    const raw = Number(new URLSearchParams(window.location.search).get("orderId"));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  });
  const [stageRequest, setStageRequest] = useState<{ status: string; stuckOnly: boolean; nonce: number } | null>(null);

  const openTrail = (orderId: number) => { setTrailOrderId(orderId); setTab("trail"); };
  const tabs: { key: Tab; label: string }[] = [
    { key: "chain", label: "Гинж" },
    { key: "trail", label: "Захиалгын түүх" },
    ...(isAdmin ? [{ key: "jobs" as Tab, label: "Ажлууд ба аудит" }] : []),
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 [&>*]:min-w-0">
      <div role="tablist" aria-label="Процессын хэсгүүд" className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-[var(--a-soft)] p-1">
        {tabs.map(item => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)} className={`rounded-full px-4 py-2 text-xs font-bold transition ${tab === item.key ? "bg-[var(--a-card)] shadow-sm" : "text-[var(--a-muted)]"}`}>{item.label}</button>
        ))}
      </div>
      {tab === "chain" && (
        <>
          <ProcessChainBoard onOpenTrail={openTrail} onSearchIn={onSearchIn} stageRequest={stageRequest} />
          <ProcessHumanQueue
            role={role}
            onNavigate={onNavigate}
            onSearchIn={onSearchIn}
            onOpenStage={(status, stuckOnly) => setStageRequest({ status, stuckOnly, nonce: Date.now() })}
          />
        </>
      )}
      {tab === "trail" && <ProcessOrderTrail orderId={trailOrderId} onOrderChange={setTrailOrderId} onSearchIn={onSearchIn} />}
      {tab === "jobs" && isAdmin && <ProcessJobsAndAudit onOpenTrail={openTrail} />}
    </div>
  );
}
