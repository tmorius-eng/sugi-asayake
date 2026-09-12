import { useEffect, useState } from "react";
import { CreditCard, LoaderCircle, LogOut, Phone, ScanFace, ShieldAlert, ShieldCheck, Store, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { roleBadgeClass, roleLabel } from "@/lib/adminRoles";
import { formatMnt } from "@shared/format";

const statusLabels: Record<string, string> = { pending: "Хүлээгдэж байна", confirmed: "Баталгаажсан", packed: "Бэлтгэсэн", out_for_delivery: "Хүргэлтэд гарсан", completed: "Дууссан", cancelled: "Цуцалсан" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдлийг гүйцэтгэж чадсангүй. Дахин оролдоно уу.";

// "Controls everything" admin overhaul (2026-09-08, Phase H): this drawer
// is now reachable by finance too (usersReadProcedure, server/_core/trpc.ts),
// not just admin -- `role` is the VIEWER's own role, used to hide/disable
// the account-changing controls (suspend, phone, loyalty adjustment, force
// logout) that stay adminProcedure-only server-side, so a finance viewer
// never sees an interactive control that would just 403 on click (the same
// class of bug a finance-viewing-the-Kanban-board case caught earlier in
// this overhaul).
export default function AdminUserDetailDrawer({ userId, role, onClose }: { userId: number; role: string; onClose: () => void }) {
  const isAdmin = role === "admin";
  const utils = trpc.useUtils();
  const detailQuery = trpc.admin.userDetail.useQuery({ userId });
  const [reason, setReason] = useState("");

  const refresh = async () => {
    await Promise.all([utils.admin.userDetail.invalidate({ userId }), utils.admin.users.invalidate()]);
  };

  const suspendUser = trpc.admin.suspendUser.useMutation({ onSuccess: refresh });
  const unsuspendUser = trpc.admin.unsuspendUser.useMutation({ onSuccess: refresh });
  const forceLogoutUser = trpc.admin.forceLogoutUser.useMutation();
  // PREMIUM-FEATURES.md TIER 5: bridges the physical-POS gap manually.
  const updateLoyaltyAdjustment = trpc.admin.updateUserLoyaltyAdjustment.useMutation({ onSuccess: refresh });
  const [loyaltyAdjustment, setLoyaltyAdjustment] = useState("0");
  // 2026-09-05 ("require phone for everyone" + "contacting admin for
  // recovery is okay" -- Tom, explicit): login is phone+password only now,
  // no email fallback -- this is the recovery tool for a legacy account
  // with no phone on file, or a mistyped one. See admin.updateUserPhone's
  // own comment in server/routers.ts for the full reasoning.
  const updatePhone = trpc.admin.updateUserPhone.useMutation({ onSuccess: refresh });
  const [phoneDraft, setPhoneDraft] = useState("");

  // Admin face gate (2026-09-08): the per-user break-glass. See
  // admin.resetUserFaceEnrollment in server/routers.ts -- this is the fix for
  // the gate refusing ONE person (new glasses, a beard, a replaced webcam),
  // as opposed to the ADMIN_FACE_GATE_ENABLED env switch, which is the fix
  // for it misbehaving for everyone.
  const resetFace = trpc.admin.resetUserFaceEnrollment.useMutation({ onSuccess: refresh });

  // 2026-09-11: staff -> branch assignment (see server/inventory.ts).
  const branchesQuery = trpc.admin.branches.useQuery(undefined, { enabled: isAdmin });
  const updateBranch = trpc.admin.updateUserBranch.useMutation({ onSuccess: refresh });
  const onSaveBranch = async (branchId: number | null) => {
    try {
      await updateBranch.mutateAsync({ userId, branchId });
      toast.success(branchId ? "Салбар оноолоо." : "Салбарыг цуцаллаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };
  const onResetFace = async () => {
    try {
      await resetFace.mutateAsync({ userId });
      toast.success("Царайн бүртгэлийг цуцаллаа. Тухайн хэрэглэгч дараагийн удаа /admin руу орохдоо дахин бүртгүүлнэ.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  // "Controls everything" admin overhaul (2026-09-08, Phase H): the ledger
  // query is finance/admin-only server-side (financeProcedure) too, so it's
  // only fetched at all when this viewer can actually see it.
  const ledgerQuery = trpc.admin.storeCreditLedger.useQuery({ userId });
  const adjustStoreCredit = trpc.admin.adjustStoreCredit.useMutation({
    onSuccess: async () => { await Promise.all([refresh(), utils.admin.storeCreditLedger.invalidate({ userId })]); },
  });
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");

  const detail = detailQuery.data;
  const isBusy = suspendUser.isPending || unsuspendUser.isPending;

  useEffect(() => {
    if (detail) {
      setLoyaltyAdjustment(String(detail.loyalty.manualAdjustmentMnt));
      setPhoneDraft(detail.phone ?? "");
    }
  }, [detail]);

  const onSavePhone = async () => {
    try {
      await updatePhone.mutateAsync({ userId, phone: phoneDraft.trim() || null });
      toast.success("Утасны дугаарыг шинэчиллээ.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const onSaveLoyaltyAdjustment = async () => {
    const value = Number(loyaltyAdjustment);
    if (!Number.isInteger(value) || value < 0) { toast.error("Эерэг бүхэл тоо оруулна уу."); return; }
    try {
      await updateLoyaltyAdjustment.mutateAsync({ userId, adjustmentMnt: value });
      toast.success("Гишүүнчлэлийн урьдчилсан дүн хадгалагдлаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const onSuspend = async () => {
    if (!window.confirm("Энэ хэрэглэгчийг түр хаах уу? Идэвхтэй session нь шууд хүчингүй болно.")) return;
    try {
      await suspendUser.mutateAsync({ userId, reason: reason.trim() || undefined });
      setReason("");
      toast.success("Хэрэглэгчийг түр хаалаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const onUnsuspend = async () => {
    try {
      await unsuspendUser.mutateAsync({ userId });
      toast.success("Хэрэглэгчийн хандалтыг сэргээлээ.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const onAdjustStoreCredit = async (sign: 1 | -1) => {
    const amount = Number(creditAmount);
    if (!Number.isInteger(amount) || amount <= 0) { toast.error("Эерэг бүхэл тоо оруулна уу."); return; }
    if (!creditReason.trim()) { toast.error("Шалтгаанаа оруулна уу."); return; }
    try {
      await adjustStoreCredit.mutateAsync({ userId, deltaMnt: amount * sign, reason: creditReason.trim() });
      setCreditAmount("");
      setCreditReason("");
      toast.success(sign === 1 ? "Зээл нэмэгдлээ." : "Зээл хасагдлаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const onForceLogout = async () => {
    if (!window.confirm("Энэ хэрэглэгчийг бүх төхөөрөмжөөс гаргах уу?")) return;
    try {
      await forceLogoutUser.mutateAsync({ userId });
      toast.success("Бүх идэвхтэй session-ийг хүчингүй болголоо.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-[var(--a-card)] p-6" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">USER DETAIL</p>
          <button type="button" onClick={onClose} aria-label="Хаах" className="rounded-full p-1.5 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)]"><X size={16} /></button>
        </div>

        {detailQuery.isLoading && <p className="mt-6 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Ачаалж байна…</p>}
        {detailQuery.error && <p className="mt-6 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{detailQuery.error.message}</p>}

        {detail && <>
          <h2 className="mt-3 font-[var(--font-display)] text-2xl font-semibold tracking-[-.05em]">{detail.name ?? "Нэр оруулаагүй"}</h2>
          <p className="mt-1 text-xs text-[var(--a-muted)]">{detail.phone ?? "Утасгүй"}{detail.email ? ` · ${detail.email}` : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${roleBadgeClass(detail.role)}`}>{roleLabel(detail.role)}</span>
            {detail.suspendedAt ? <span className="rounded-full bg-[var(--a-neg-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-neg)]">Түр хаагдсан</span> : <span className="rounded-full bg-[var(--a-pos-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-pos)]">Идэвхтэй</span>}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[var(--a-soft)] p-4"><p className="text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]">НИЙТ ЗАХИАЛГА</p><p className="mt-1 font-[var(--font-display)] text-xl font-semibold">{detail.orders.length}</p></div>
            <div className="rounded-2xl bg-[var(--a-soft)] p-4"><p className="text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]">НИЙТ ЗАРЦУУЛАЛТ</p><p className="mt-1 font-[var(--font-display)] text-xl font-semibold">{formatMnt(detail.totalSpentMnt)}</p></div>
          </div>

          {/* PREMIUM-FEATURES.md TIER 5 */}
          <div className="mt-4 rounded-2xl border border-[var(--a-border)] p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]"><CreditCard size={13} /> ГИШҮҮНЧЛЭЛИЙН КАРТ</p>
            <div className="mt-2 flex items-center justify-between"><span className="font-[var(--font-display)] text-lg font-semibold">{detail.loyalty.currentTier.name}</span><span className="text-xs font-bold text-[#df1f3d]">{detail.loyalty.currentTier.discountPercent > 0 ? `-${detail.loyalty.currentTier.discountPercent}%` : "Хямдралгүй"}</span></div>
            <p className="mt-1 text-[11px] text-[var(--a-muted)]">Онлайн: {formatMnt(detail.loyalty.onlineSpendMnt)} + Гараар: {formatMnt(detail.loyalty.manualAdjustmentMnt)} = Нийт {formatMnt(detail.loyalty.totalSpendMnt)}</p>
            {isAdmin ? <>
              <label className="mt-3 grid gap-1.5 text-xs font-bold">Дэлгүүрт биечлэн худалдан авсан урьдчилсан дүн (₮)
                <div className="flex gap-2">
                  <input type="number" min="0" aria-label="Оноо" value={loyaltyAdjustment} onChange={event => setLoyaltyAdjustment(event.target.value)} className="h-10 flex-1 rounded-xl border border-[var(--a-border)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
                  <button type="button" disabled={updateLoyaltyAdjustment.isPending} onClick={onSaveLoyaltyAdjustment} className="shrink-0 rounded-xl bg-[var(--a-btn-dark)] px-4 text-xs font-bold text-white disabled:opacity-60">{updateLoyaltyAdjustment.isPending ? <LoaderCircle className="animate-spin" size={14} /> : "Хадгалах"}</button>
                </div>
              </label>
              <p className="mt-2 text-[10px] leading-4 text-[var(--a-faint)]">Smart POS-той API холбоогүй тул үйлчлүүлэгчийн дэлгүүрт биечлэн худалдан авсан түүхийг эндээс гараар нэмж, тохирох шатанд шилжүүлж болно.</p>
            </> : null}
          </div>

          {/* "Controls everything" admin overhaul (2026-09-08, Phase H):
              admin.storeCreditLedger/adjustStoreCredit are financeProcedure,
              so this card is meaningful for both roles that can reach this
              drawer at all (usersReadProcedure is admin+finance) -- no
              isAdmin gate needed here, unlike the account-changing cards
              below. */}
          <div className="mt-4 rounded-2xl border border-[var(--a-border)] p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]"><Wallet size={13} /> ДЭЛГҮҮРИЙН ЗЭЭЛ</p>
            <p className="mt-2 font-[var(--font-display)] text-lg font-semibold">{formatMnt(detail.storeCreditMnt)}</p>
            <div className="mt-3 grid gap-2">
              <input type="number" min="1" value={creditAmount} onChange={event => setCreditAmount(event.target.value)} placeholder="Дүн (₮)" className="h-10 rounded-xl border border-[var(--a-border)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
              <input value={creditReason} onChange={event => setCreditReason(event.target.value)} placeholder="Шалтгаан (жишээ нь: үйлчилгээний нөхөн олговор)" className="h-10 rounded-xl border border-[var(--a-border)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
              <div className="flex gap-2">
                <button type="button" disabled={adjustStoreCredit.isPending} onClick={() => onAdjustStoreCredit(1)} className="flex-1 rounded-xl bg-[#2c7650] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60">{adjustStoreCredit.isPending ? <LoaderCircle className="mx-auto animate-spin" size={14} /> : "Нэмэх"}</button>
                <button type="button" disabled={adjustStoreCredit.isPending} onClick={() => onAdjustStoreCredit(-1)} className="flex-1 rounded-xl border border-[var(--a-border)] px-4 py-2.5 text-xs font-bold text-[var(--a-text-soft)] disabled:opacity-60">{adjustStoreCredit.isPending ? <LoaderCircle className="mx-auto animate-spin" size={14} /> : "Хасах"}</button>
              </div>
            </div>
            {ledgerQuery.data && ledgerQuery.data.length > 0 && (
              <div className="mt-3 grid gap-1.5 border-t border-[var(--a-border)] pt-3">
                {ledgerQuery.data.slice(0, 5).map(entry => (
                  <div key={entry.id} className="flex items-center justify-between gap-2 text-[11px] text-[var(--a-muted)]">
                    <span className="truncate">{entry.reason}{entry.actorEmail ? ` — ${entry.actorEmail}` : ""}</span>
                    <span className={`shrink-0 font-bold ${entry.deltaMnt > 0 ? "text-[var(--a-pos)]" : "text-[var(--a-neg)]"}`}>{entry.deltaMnt > 0 ? "+" : ""}{formatMnt(entry.deltaMnt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2026-09-05 ("require phone for everyone" -- Tom, explicit): login
              is phone+password only, no email fallback -- this is the
              account-recovery tool for a legacy account with no phone on
              file, or a mistyped one. Fixing the phone here never touches
              the password: once it's right, the account's existing password
              keeps working immediately (login just needed the right phone
              to find the row). */}
          {isAdmin && <div className="mt-4 rounded-2xl border border-[var(--a-border)] p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]"><Phone size={13} /> УТАСНЫ ДУГААР</p>
            <p className="mt-1 text-[11px] leading-4 text-[var(--a-faint)]">Нэвтрэх нь одоо зөвхөн утасны дугаар + нууц үгээр хийгддэг. Хэрэглэгч утасгүй эсвэл буруу дугаартай бол (нэвтэрч чадахгүй) эндээс шууд засаж болно.</p>
            <div className="mt-3 flex gap-2">
              <input value={phoneDraft} onChange={event => setPhoneDraft(event.target.value)} placeholder="9911 2233" inputMode="tel" className="h-10 flex-1 rounded-xl border border-[var(--a-border)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
              <button type="button" disabled={updatePhone.isPending} onClick={onSavePhone} className="shrink-0 rounded-xl bg-[var(--a-btn-dark)] px-4 text-xs font-bold text-white disabled:opacity-60">{updatePhone.isPending ? <LoaderCircle className="animate-spin" size={14} /> : "Хадгалах"}</button>
            </div>
          </div>}

          {isAdmin && <div className="mt-4 rounded-2xl border border-[var(--a-border)] p-4">
            {detail.suspendedReason && <p className="mb-3 rounded-xl bg-[var(--a-neg-soft)] px-3 py-2 text-xs leading-5 text-[var(--a-neg)]">Шалтгаан: {detail.suspendedReason}</p>}
            <div className="flex flex-wrap gap-2">
              {detail.suspendedAt
                ? <button type="button" disabled={isBusy} onClick={onUnsuspend} className="inline-flex items-center gap-1.5 rounded-full bg-[#2c7650] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{unsuspendUser.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <ShieldCheck size={14} />}Хандалт сэргээх</button>
                : <button type="button" disabled={isBusy} onClick={onSuspend} className="inline-flex items-center gap-1.5 rounded-full bg-[#df1f3d] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{suspendUser.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <ShieldAlert size={14} />}Түр хаах</button>}
              <button type="button" disabled={forceLogoutUser.isPending} onClick={onForceLogout} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 py-2 text-xs font-bold text-[var(--a-text-soft)] disabled:opacity-60">{forceLogoutUser.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <LogOut size={14} />}Бүх төхөөрөмжөөс гаргах</button>
            </div>
            {!detail.suspendedAt && <label className="mt-3 grid gap-1.5 text-xs font-bold">Түр хаах шалтгаан (сонголтоор)<input value={reason} onChange={event => setReason(event.target.value)} placeholder="ж: төлбөрийн маргаан" className="h-10 rounded-xl border border-[var(--a-border)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>}
          </div>}

          {/* Admin face gate (2026-09-08): only shown for accounts the gate
              actually applies to -- a plain customer has no /admin access and
              therefore never enrolls a face, so the control would be
              meaningless noise on their drawer. */}
          {/* 2026-09-11: where this staff member works. A store consultant
              (staff) can only receive goods and count stock at this branch. */}
          {isAdmin && (detail.role === "staff" || detail.role === "warehouse") && <div className="mt-4 rounded-2xl border border-[var(--a-border)] p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]"><Store size={13} /> АЖИЛЛАДАГ САЛБАР</p>
            <p className="mt-1 text-[11px] leading-4 text-[var(--a-faint)]">{detail.role === "staff" ? "Дэлгүүрийн зөвлөх зөвхөн энэ салбарын барааг хүлээн авч, тоолж чадна." : "Агуулахын ажилтан бүх салбарт ажиллаж болно; энд зөвхөн үндсэн байршлыг заана."}</p>
            <select value={detail.branchId ?? ""} disabled={updateBranch.isPending} onChange={event => void onSaveBranch(event.target.value ? Number(event.target.value) : null)} className="mt-3 h-10 w-full rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs outline-none focus:border-[#df1f3d]" aria-label="Ажилладаг салбар">
              <option value="">Салбар оноогоогүй</option>
              {(branchesQuery.data ?? []).filter(branch => branch.isActive).map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.kind === "warehouse" ? " (агуулах)" : ""}</option>)}
            </select>
          </div>}

          {isAdmin && detail.role !== "user" && <div className="mt-4 rounded-2xl border border-[var(--a-border)] p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]"><ScanFace size={13} /> ЦАРАЙН БҮРТГЭЛ</p>
            <p className="mt-1 text-[11px] leading-4 text-[var(--a-faint)]">Админ хэсэгт нэвтрэхэд царайгаар нэмэлт баталгаажуулалт хийгддэг. Хэрэв тухайн хүнийг таньж чадахгүй болсон бол (нүдний шил, сахал, камер солигдсон гэх мэт) бүртгэлийг нь цуцлаад дахин бүртгүүлж болно. Нууц үгэнд нөлөөлөхгүй.</p>
            <button type="button" disabled={resetFace.isPending} onClick={onResetFace} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 py-2 text-xs font-bold text-[var(--a-text-soft)] disabled:opacity-60">
              {resetFace.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <ScanFace size={14} />}Царайн бүртгэлийг цуцлах
            </button>
          </div>}

          <div className="mt-6">
            <p className="text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]">ЗАХИАЛГЫН ТҮҮХ</p>
            <div className="mt-3 grid gap-2">
              {detail.orders.map(order => (
                <div key={order.id} className="rounded-2xl border border-[var(--a-border)] px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#df1f3d]">{order.orderNumber}</span>
                    <span className="text-xs font-bold">{formatMnt(order.totalMnt)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[var(--a-muted)]">
                    <span>{statusLabels[order.status] ?? order.status}</span>
                    <span>{new Date(order.createdAt).toLocaleDateString("mn-MN")}</span>
                  </div>
                </div>
              ))}
              {detail.orders.length === 0 && <p className="rounded-2xl bg-[var(--a-soft)] px-3 py-6 text-center text-xs text-[var(--a-muted)]">Захиалгын түүх алга.</p>}
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}
