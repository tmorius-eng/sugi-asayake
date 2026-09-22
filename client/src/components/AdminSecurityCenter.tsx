import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, ListFilter, LoaderCircle, LogIn, ScanFace, ShieldCheck, ShieldQuestion, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { actionLabel, actionLabels } from "@/lib/adminAuditLabels";
import { FACE_MATCH_THRESHOLD } from "@shared/face-auth";
import { GenericListView, type GenericListColumn } from "./admin/GenericListView";

const reasonLabels: Record<string, string> = {
  invalid_credentials: "Имэйл/нууц үг буруу",
  suspended: "Түр хаагдсан",
  unverified: "Баталгаажаагүй",
  locked: "Олон буруу оролдлого — түгжигдсэн",
  // /admin-ийн нууц үгийн алхам (2026-09-22).
  reauth: "/admin нууц үг баталгаажуулсан",
  reauth_invalid: "/admin нууц үг буруу",
  reauth_locked: "/admin нууц үг — түгжигдсэн",
};

const formatDateTime = (date: Date) => new Date(date).toLocaleString("mn-MN", { dateStyle: "medium", timeStyle: "short" });

// Project "SUGI Desk" Phase 7 (2026-09-07): "unified System Logs" is this
// same 3-tab shell -- Audit Log + Login History were already exactly this
// shape, so the only real addition is the third tab below, backed by a
// genuinely new data source (Honeybadger's error feed) rather than a
// relabeling of the first two.
export default function AdminSecurityCenter() {
  const [tab, setTab] = useState<"audit" | "logins" | "face" | "errors" | "sql">("audit");

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <div className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-[var(--a-soft)] p-1">
        <button type="button" onClick={() => setTab("audit")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${tab === "audit" ? "bg-[var(--a-card)] shadow-sm" : "text-[var(--a-muted)]"}`}>Аудит лог</button>
        <button type="button" onClick={() => setTab("logins")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${tab === "logins" ? "bg-[var(--a-card)] shadow-sm" : "text-[var(--a-muted)]"}`}>Нэвтрэлтийн түүх</button>
        <button type="button" onClick={() => setTab("face")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${tab === "face" ? "bg-[var(--a-card)] shadow-sm" : "text-[var(--a-muted)]"}`}>Царайн шалгалт</button>
        <button type="button" onClick={() => setTab("errors")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${tab === "errors" ? "bg-[var(--a-card)] shadow-sm" : "text-[var(--a-muted)]"}`}>Алдааны хяналт</button>
        <button type="button" onClick={() => setTab("sql")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${tab === "sql" ? "bg-[var(--a-card)] shadow-sm" : "text-[var(--a-muted)]"}`}>SQL лог</button>
      </div>
      {tab === "audit" ? <AuditLogTab /> : tab === "logins" ? <LoginHistoryTab /> : tab === "face" ? <FaceAttemptsTab /> : tab === "errors" ? <ErrorMonitoringTab /> : <SqlQueryLogTab />}
    </div>
  );
}

/**
 * Admin face gate (2026-09-08) — the same role LoginHistoryTab plays for
 * password logins: an admin needs to be able to see "someone failed the face
 * check on this account six times last night."
 *
 * The distance column is the reason this tab is worth having beyond a plain
 * pass/fail log. FACE_MATCH_THRESHOLD (shared/face-auth.ts) starts at the
 * library's conventional 0.6, which is a starting point and not a value
 * proven against these particular staff faces. Reading the real distances
 * here is how that number gets tuned: if genuine staff sit just above the
 * line, raise it; if anything wrong ever passes, lower it. Stored as
 * thousandths server-side, shown here as the actual decimal.
 */
function FaceAttemptsTab() {
  const query = trpc.admin.faceAttempts.useQuery({ limit: 200 });
  const attempts = query.data ?? [];
  type FaceAttemptRow = (typeof attempts)[number];
  const headerCell = "border-b border-[var(--a-border)] pb-2";
  const bodyCell = "border-b border-[var(--a-border)] py-3";

  const outcomeBadge = (outcome: FaceAttemptRow["outcome"]) => {
    switch (outcome) {
      case "verified":
        return <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-pos-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-pos)]"><CheckCircle2 size={11} />Баталгаажсан</span>;
      case "enrolled":
        return <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-info)]"><ScanFace size={11} />Бүртгүүлсэн</span>;
      case "no_match":
        return <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-neg-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-neg)]"><XCircle size={11} />Таарсангүй</span>;
      case "liveness_failed":
        return <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-warn-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-warn)]"><AlertTriangle size={11} />Хөдөлгөөн таарсангүй</span>;
      default:
        return <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-muted)]"><ShieldQuestion size={11} />Алдаа</span>;
    }
  };

  const columns: GenericListColumn<FaceAttemptRow>[] = [
    { id: "date", header: "ОГНОО", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`, render: row => formatDateTime(row.createdAt) },
    { id: "user", header: "ХЭРЭГЛЭГЧ", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs`, render: row => row.userName || row.userPhone || (row.userId ? `#${row.userId}` : "—") },
    { id: "outcome", header: "ҮР ДҮН", headerClassName: headerCell, cellClassName: bodyCell, render: row => outcomeBadge(row.outcome) },
    {
      id: "distance", header: "ЗӨРҮҮ", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`,
      // Lower is a closer match. Shown to 3 decimals because the interesting
      // differences between a comfortable pass and a near-miss live there.
      render: row => (row.distance === null ? "—" : (row.distance / 1000).toFixed(3)),
    },
    { id: "detail", header: "ТАЙЛБАР", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`, render: row => row.detail ?? "—" },
    { id: "ip", header: "IP", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`, render: row => row.ip ?? "—" },
  ];

  return (
    <div>
      <p className="rounded-2xl bg-[var(--a-soft)] p-4 text-xs leading-5 text-[var(--a-muted)]">
        Админ хэсэгт нэвтрэхийн өмнөх царайн шалгалтын түүх. <strong>Зөрүү</strong> нь бүртгэсэн царайтай хэр ойр байсныг харуулна — бага байх тусам сайн, {FACE_MATCH_THRESHOLD}-аас доош бол зөвшөөрөгдөнө. Жинхэнэ ажилтнууд байнга энэ хязгаарын ойролцоо унаж байвал хязгаарыг сулруулах шаардлагатай.
      </p>

      {query.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}
      {query.error && <p className="mt-5 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{query.error.message}</p>}

      {!query.isLoading && !query.error && (
        <div className="mt-5">
          <GenericListView<FaceAttemptRow>
            rows={attempts}
            getRowId={row => row.id}
            columns={columns}
            tableClassName="min-w-[720px] w-full border-separate border-spacing-0 text-left"
            emptyMessage={<><ScanFace className="mx-auto mb-2 text-[var(--a-faint)]" size={22} />Царайн шалгалтын түүх алга.</>}
            itemLabel="бичлэг"
          />
        </div>
      )}
    </div>
  );
}

function AuditLogTab() {
  const [action, setAction] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const query = trpc.admin.auditLogs.useQuery({
    action: action || undefined,
    actorEmail: actorEmail.trim() || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const logs = query.data ?? [];
  type AuditLogRow = (typeof logs)[number];
  const headerCell = "border-b border-[var(--a-border)] pb-2";
  const bodyCell = "border-b border-[var(--a-border)] py-3";
  const columns: GenericListColumn<AuditLogRow>[] = [
    { id: "date", header: "ОГНОО", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`, render: log => formatDateTime(log.createdAt) },
    { id: "admin", header: "ADMIN", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs`, render: log => log.actorEmail ?? `#${log.actorUserId}` },
    { id: "action", header: "ҮЙЛДЭЛ", headerClassName: headerCell, cellClassName: bodyCell, render: log => <span className="rounded-full bg-[var(--a-soft)] px-2.5 py-1 text-[10px] font-extrabold">{actionLabel(log.action)}</span> },
    { id: "entity", header: "ОБЪЕКТ", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`, render: log => `${log.entityType}${log.entityId ? ` #${log.entityId}` : ""}` },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-[var(--a-soft)] p-4">
        <label className="grid gap-1.5 text-xs font-bold">Үйлдлийн төрөл
          <select value={action} onChange={event => setAction(event.target.value)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]">
            <option value="">Бүгд</option>
            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Admin имэйл
          <input value={actorEmail} onChange={event => setActorEmail(event.target.value)} placeholder="жишээ: owner@" className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Эхлэх огноо
          <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Дуусах огноо
          <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        {(action || actorEmail || dateFrom || dateTo) && <button type="button" onClick={() => { setAction(""); setActorEmail(""); setDateFrom(""); setDateTo(""); }} className="h-10 text-xs font-bold text-[var(--a-neg)]">Шүүлтүүр цэвэрлэх</button>}
      </div>

      {query.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}
      {query.error && <p className="mt-5 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{query.error.message}</p>}

      {!query.isLoading && !query.error && (
        <div className="mt-5">
          <GenericListView<AuditLogRow>
            rows={logs}
            getRowId={log => log.id}
            columns={columns}
            tableClassName="min-w-[680px] w-full border-separate border-spacing-0 text-left"
            emptyMessage={<><ListFilter className="mx-auto mb-2 text-[var(--a-faint)]" size={22} />Тохирох лог олдсонгүй.</>}
          />
        </div>
      )}
    </div>
  );
}

const LOGIN_HISTORY_PAGE_SIZE = 50;

function LoginHistoryTab() {
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState<"all" | "success" | "failed">("all");
  const [page, setPage] = useState(1);

  // Server owns the current page now (Phase M) -- GenericListView's own
  // "reset to page 1 on search change" effect only applies to its
  // client-side searchQuery, which this tab doesn't use, so this filter
  // panel needs the same reset done here instead.
  useEffect(() => {
    setPage(1);
  }, [email, outcome]);

  const query = trpc.admin.loginHistory.useQuery({ email: email.trim() || undefined, outcome, page, pageSize: LOGIN_HISTORY_PAGE_SIZE });
  const attempts = query.data?.rows ?? [];
  type LoginAttemptRow = (typeof attempts)[number];
  const headerCell = "border-b border-[var(--a-border)] pb-2";
  const bodyCell = "border-b border-[var(--a-border)] py-3";
  const columns: GenericListColumn<LoginAttemptRow>[] = [
    { id: "date", header: "ОГНОО", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`, render: attempt => formatDateTime(attempt.createdAt) },
    { id: "phone", header: "УТАС", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs`, render: attempt => attempt.email },
    {
      id: "status", header: "ТӨЛӨВ", headerClassName: headerCell, cellClassName: bodyCell,
      render: attempt => attempt.success
        ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-pos-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-pos)]"><CheckCircle2 size={11} />Амжилттай</span>
        : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-neg-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-neg)]"><XCircle size={11} />{attempt.reason ? (reasonLabels[attempt.reason] ?? attempt.reason) : "Амжилтгүй"}</span>,
    },
    { id: "ip", header: "IP", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`, render: attempt => attempt.ipAddress ?? "—" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-[var(--a-soft)] p-4">
        <label className="grid gap-1.5 text-xs font-bold">Утас
          <input value={email} onChange={event => setEmail(event.target.value)} placeholder="хайх утасны дугаар" className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Төлөв
          <select value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]">
            <option value="all">Бүгд</option>
            <option value="success">Амжилттай</option>
            <option value="failed">Амжилтгүй</option>
          </select>
        </label>
      </div>

      {query.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}
      {query.error && <p className="mt-5 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{query.error.message}</p>}

      {!query.isLoading && !query.error && (
        <div className="mt-5">
          <GenericListView<LoginAttemptRow>
            rows={attempts}
            getRowId={attempt => attempt.id}
            columns={columns}
            tableClassName="min-w-[640px] w-full border-separate border-spacing-0 text-left"
            emptyMessage={<><LogIn className="mx-auto mb-2 text-[var(--a-faint)]" size={22} />Нэвтрэлтийн түүх алга.</>}
            itemLabel="бичлэг"
            serverPagination={{ page, pageSize: LOGIN_HISTORY_PAGE_SIZE, total: query.data?.totalCount ?? 0, onPageChange: setPage }}
          />
        </div>
      )}
    </div>
  );
}

const formatDateTimeOrDash = (value: string | null) => (value ? formatDateTime(new Date(value)) : "—");

// Project "SUGI Desk" Phase 7: Honeybadger's own error feed, read via
// server/_core/honeybadgerReadApi.ts's Personal Auth Token integration
// (distinct from server/_core/honeybadger.ts's send-only SDK config). Three
// distinct, honestly-labeled states -- not configured / a real fetch error
// (bad token, Honeybadger API down) / a genuinely empty, healthy feed --
// never collapsed into one generic "no data" message the other two tabs use,
// since conflating "nobody has set this up" with "nothing is currently
// unresolved" would misinform whoever's reading this the most (an admin
// checking site health).
function ErrorMonitoringTab() {
  const query = trpc.admin.honeybadgerFaults.useQuery();

  if (query.isLoading) return <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>;
  if (query.error) return <p className="rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{query.error.message}</p>;

  const result = query.data;
  if (!result?.configured) {
    return (
      <p className="flex items-start gap-2 rounded-2xl bg-[var(--a-soft)] p-4 text-xs leading-5 text-[var(--a-muted)]">
        <ShieldQuestion className="mt-0.5 shrink-0" size={16} />
        Honeybadger-ийн <code>HONEYBADGER_PERSONAL_AUTH_TOKEN</code> тохируулаагүй тул алдааны жагсаалт харагдахгүй байна. Honeybadger акаунтын Settings → Authentication хэсгээс аваад <code>.env</code>-д нэмнэ үү.
      </p>
    );
  }
  if (result.error) {
    return <p className="flex items-start gap-2 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs leading-5 text-[var(--a-neg)]"><AlertTriangle className="mt-0.5 shrink-0" size={16} />Honeybadger-с уншихад алдаа гарлаа: {result.error}</p>;
  }

  type FaultRow = (typeof result.faults)[number];
  const headerCell = "border-b border-[var(--a-border)] pb-2";
  const bodyCell = "border-b border-[var(--a-border)] py-3";
  const columns: GenericListColumn<FaultRow>[] = [
    { id: "date", header: "СҮҮЛД ГАРСАН", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`, render: fault => formatDateTimeOrDash(fault.lastNoticeAt ?? fault.createdAt) },
    {
      id: "error", header: "АЛДАА", headerClassName: headerCell, cellClassName: bodyCell,
      render: fault => <div><p className="font-bold">{fault.klass}</p>{fault.message && <p className="mt-0.5 max-w-md truncate text-[11px] text-[var(--a-muted)]" title={fault.message}>{fault.message}</p>}</div>,
    },
    { id: "where", header: "ГАЗАР", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`, render: fault => [fault.environment, fault.component, fault.action].filter(Boolean).join(" · ") || "—" },
    { id: "count", header: "ТОО", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs font-bold`, render: fault => fault.noticesCount },
    {
      id: "status", header: "ТӨЛӨВ", headerClassName: headerCell, cellClassName: bodyCell,
      render: fault => fault.resolved
        ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-pos-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-pos)]"><CheckCircle2 size={11} />Шийдэгдсэн</span>
        : fault.ignored
          ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-faint)]">Игнорсон</span>
          : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-neg-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-neg)]"><AlertTriangle size={11} />Идэвхтэй</span>,
    },
  ];

  return (
    <div>
      <GenericListView<FaultRow>
        rows={result.faults}
        getRowId={fault => fault.id}
        columns={columns}
        tableClassName="min-w-[720px] w-full border-separate border-spacing-0 text-left"
        emptyMessage={<><ShieldCheck className="mx-auto mb-2 text-[var(--a-pos)]" size={22} />Сүүлийн үед бүртгэгдсэн алдаа алга.</>}
      />
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-[var(--a-faint)]"><ShieldQuestion size={13} aria-hidden="true" />Honeybadger-с хамгийн сүүлийн 25 алдаа харагдана.</p>
    </div>
  );
}

// Admin overhaul (2026-09-08, Phase K): the 4th Security Center tab -- an
// in-process ring buffer (server/_core/sqlQueryLog.ts), not a real
// server-side query log. No "duration" column: Drizzle's own logging hook
// fires at issue-time, not completion, so that number can't be known here.
function SqlQueryLogTab() {
  const query = trpc.admin.recentSqlQueries.useQuery();
  const rows = query.data ?? [];
  type SqlQueryRow = (typeof rows)[number];
  const headerCell = "border-b border-[var(--a-border)] pb-2";
  const bodyCell = "border-b border-[var(--a-border)] py-3 align-top";
  const columns: GenericListColumn<SqlQueryRow>[] = [
    { id: "date", header: "ОГНОО", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)] whitespace-nowrap`, render: row => formatDateTime(new Date(row.loggedAt)) },
    { id: "query", header: "QUERY", headerClassName: headerCell, cellClassName: `${bodyCell} font-mono text-[11px] leading-5`, render: row => <code className="block max-w-2xl whitespace-pre-wrap break-all">{row.query}</code> },
    { id: "params", header: "PARAMS", headerClassName: headerCell, cellClassName: `${bodyCell} font-mono text-[11px] text-[var(--a-muted)]`, render: row => row.params.length > 0 ? <code className="block max-w-xs whitespace-pre-wrap break-all">[{row.params.join(", ")}]</code> : "—" },
  ];

  return (
    <div>
      {query.isLoading && <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}
      {query.error && <p className="rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{query.error.message}</p>}
      {!query.isLoading && !query.error && (
        <GenericListView<SqlQueryRow>
          rows={rows}
          getRowId={row => row.id}
          columns={columns}
          tableClassName="min-w-[720px] w-full border-separate border-spacing-0 text-left"
          emptyMessage={<><Database className="mx-auto mb-2 text-[var(--a-faint)]" size={22} />Одоогоор бүртгэгдсэн query алга.</>}
        />
      )}
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-[var(--a-faint)]"><ShieldQuestion size={13} aria-hidden="true" />Зөвхөн энэ серверийн процессийн санах ойд хадгалагдана (сүүлийн 200) — restart хийвэл цэвэрлэгдэнэ, Aiven-ийн бодит query log биш.</p>
    </div>
  );
}
