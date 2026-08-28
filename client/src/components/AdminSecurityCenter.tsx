import { useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, ListFilter, LoaderCircle, LogIn, ShieldQuestion, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

const actionLabels: Record<string, string> = {
  "staff_invitation.created": "Ажилтан урьсан",
  "staff_invitation.revoked": "Урилга цуцалсан",
  "user.role_updated": "Хэрэглэгчийн эрх өөрчилсөн",
  "user.suspended": "Хэрэглэгчийг түр хаасан",
  "user.unsuspended": "Хандалт сэргээсэн",
  "user.force_logout": "Бүх төхөөрөмжөөс гаргасан",
  "order.updated": "Захиалга шинэчилсэн",
  "post.created": "Пост үүсгэсэн",
  "post.updated": "Пост засварласан",
  "post.deleted": "Пост устгасан",
  "product.created": "Бүтээгдэхүүн үүсгэсэн",
  "product.updated": "Бүтээгдэхүүн засварласан",
  "product.deleted": "Бүтээгдэхүүн устгасан",
  "category.created": "Ангилал үүсгэсэн",
  "category.updated": "Ангилал засварласан",
  "site_media.updated": "Медиа шинэчилсэн",
  "site_media.cleared": "Медиа цэвэрлэсэн",
};
const actionLabel = (action: string) => actionLabels[action] ?? action;

const reasonLabels: Record<string, string> = {
  invalid_credentials: "Имэйл/нууц үг буруу",
  suspended: "Түр хаагдсан",
  unverified: "Баталгаажаагүй",
};

const formatDateTime = (date: Date) => new Date(date).toLocaleString("mn-MN", { dateStyle: "medium", timeStyle: "short" });

export default function AdminSecurityCenter() {
  const [tab, setTab] = useState<"audit" | "logins">("audit");

  return (
    <div className="grid gap-5">
      <div className="inline-flex w-fit gap-1 rounded-full bg-[#f8f5ef] p-1">
        <button type="button" onClick={() => setTab("audit")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${tab === "audit" ? "bg-white shadow-sm" : "text-[#77787d]"}`}>Аудит лог</button>
        <button type="button" onClick={() => setTab("logins")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${tab === "logins" ? "bg-white shadow-sm" : "text-[#77787d]"}`}>Нэвтрэлтийн түүх</button>
      </div>
      {tab === "audit" ? <AuditLogTab /> : <LoginHistoryTab />}
    </div>
  );
}

function LogPagination({ page, total, pageSize, onPageChange }: { page: number; total: number; pageSize: number; onPageChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#77787d]">
      <span>{page} / {pageCount} хуудас ({total} бичлэг)</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page === 1} onClick={() => onPageChange(page - 1)} className="inline-flex items-center gap-1 rounded-full border border-black/10 px-3 py-2 font-bold disabled:opacity-40"><ChevronLeft size={14} />Өмнөх</button>
        <button type="button" disabled={page === pageCount} onClick={() => onPageChange(page + 1)} className="inline-flex items-center gap-1 rounded-full border border-black/10 px-3 py-2 font-bold disabled:opacity-40">Дараах<ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

function AuditLogTab() {
  const [action, setAction] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const query = trpc.admin.auditLogs.useQuery({
    action: action || undefined,
    actorEmail: actorEmail.trim() || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const allLogs = query.data ?? [];
  const logs = allLogs.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-[#f8f5ef] p-4">
        <label className="grid gap-1.5 text-xs font-bold">Үйлдлийн төрөл
          <select value={action} onChange={event => { setAction(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-black/10 bg-white px-2 text-xs font-normal outline-none focus:border-[#df1f3d]">
            <option value="">Бүгд</option>
            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Admin имэйл
          <input value={actorEmail} onChange={event => { setActorEmail(event.target.value); setPage(1); }} placeholder="жишээ: owner@" className="h-10 rounded-lg border border-black/10 bg-white px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Эхлэх огноо
          <input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Дуусах огноо
          <input type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        {(action || actorEmail || dateFrom || dateTo) && <button type="button" onClick={() => { setAction(""); setActorEmail(""); setDateFrom(""); setDateTo(""); setPage(1); }} className="h-10 text-xs font-bold text-[#a51630]">Шүүлтүүр цэвэрлэх</button>}
      </div>

      {query.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}
      {query.error && <p className="mt-5 rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{query.error.message}</p>}

      {!query.isLoading && !query.error && (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[680px] w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">
                <th className="border-b border-black/8 pb-2">ОГНОО</th>
                <th className="border-b border-black/8 pb-2">ADMIN</th>
                <th className="border-b border-black/8 pb-2">ҮЙЛДЭЛ</th>
                <th className="border-b border-black/8 pb-2">ОБЪЕКТ</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="text-sm">
                  <td className="border-b border-black/6 py-3 text-xs text-[#6f7075]">{formatDateTime(log.createdAt)}</td>
                  <td className="border-b border-black/6 py-3 text-xs">{log.actorEmail ?? `#${log.actorUserId}`}</td>
                  <td className="border-b border-black/6 py-3"><span className="rounded-full bg-[#f8f5ef] px-2.5 py-1 text-[10px] font-extrabold">{actionLabel(log.action)}</span></td>
                  <td className="border-b border-black/6 py-3 text-xs text-[#77787d]">{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-sm text-[#77787d]"><ListFilter className="mx-auto mb-2 text-[#a9a49a]" size={22} />Тохирох лог олдсонгүй.</td></tr>}
            </tbody>
          </table>
          <LogPagination page={page} total={allLogs.length} pageSize={pageSize} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

function LoginHistoryTab() {
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState<"all" | "success" | "failed">("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const query = trpc.admin.loginHistory.useQuery({ email: email.trim() || undefined, outcome });
  const allAttempts = query.data ?? [];
  const attempts = allAttempts.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-[#f8f5ef] p-4">
        <label className="grid gap-1.5 text-xs font-bold">Имэйл
          <input value={email} onChange={event => { setEmail(event.target.value); setPage(1); }} placeholder="хайх имэйл" className="h-10 rounded-lg border border-black/10 bg-white px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Төлөв
          <select value={outcome} onChange={event => { setOutcome(event.target.value as typeof outcome); setPage(1); }} className="h-10 rounded-lg border border-black/10 bg-white px-2 text-xs font-normal outline-none focus:border-[#df1f3d]">
            <option value="all">Бүгд</option>
            <option value="success">Амжилттай</option>
            <option value="failed">Амжилтгүй</option>
          </select>
        </label>
      </div>

      {query.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}
      {query.error && <p className="mt-5 rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{query.error.message}</p>}

      {!query.isLoading && !query.error && (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[640px] w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">
                <th className="border-b border-black/8 pb-2">ОГНОО</th>
                <th className="border-b border-black/8 pb-2">ИМЭЙЛ</th>
                <th className="border-b border-black/8 pb-2">ТӨЛӨВ</th>
                <th className="border-b border-black/8 pb-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map(attempt => (
                <tr key={attempt.id} className="text-sm">
                  <td className="border-b border-black/6 py-3 text-xs text-[#6f7075]">{formatDateTime(attempt.createdAt)}</td>
                  <td className="border-b border-black/6 py-3 text-xs">{attempt.email}</td>
                  <td className="border-b border-black/6 py-3">
                    {attempt.success
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f2ec] px-2.5 py-1 text-[10px] font-extrabold text-[#2c7650]"><CheckCircle2 size={11} />Амжилттай</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0f2] px-2.5 py-1 text-[10px] font-extrabold text-[#a51630]"><XCircle size={11} />{attempt.reason ? (reasonLabels[attempt.reason] ?? attempt.reason) : "Амжилтгүй"}</span>}
                  </td>
                  <td className="border-b border-black/6 py-3 text-xs text-[#77787d]">{attempt.ipAddress ?? "—"}</td>
                </tr>
              ))}
              {attempts.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-sm text-[#77787d]"><LogIn className="mx-auto mb-2 text-[#a9a49a]" size={22} />Нэвтрэлтийн түүх алга.</td></tr>}
            </tbody>
          </table>
          <LogPagination page={page} total={allAttempts.length} pageSize={pageSize} onPageChange={setPage} />
        </div>
      )}
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-[#a9a49a]"><ShieldQuestion size={13} aria-hidden="true" />Хамгийн сүүлийн 200 бичлэг харагдана.</p>
    </div>
  );
}
