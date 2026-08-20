import { useState } from "react";
import { LoaderCircle, LogOut, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const formatMnt = (amount: number) => `${new Intl.NumberFormat("mn-MN").format(amount)}₮`;
const statusLabels: Record<string, string> = { pending: "Хүлээгдэж байна", confirmed: "Баталгаажсан", packed: "Бэлтгэсэн", out_for_delivery: "Хүргэлтэд гарсан", completed: "Дууссан", cancelled: "Цуцалсан" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдлийг гүйцэтгэж чадсангүй. Дахин оролдоно уу.";

export default function AdminUserDetailDrawer({ userId, onClose }: { userId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const detailQuery = trpc.admin.userDetail.useQuery({ userId });
  const [reason, setReason] = useState("");

  const refresh = async () => {
    await Promise.all([utils.admin.userDetail.invalidate({ userId }), utils.admin.users.invalidate()]);
  };

  const suspendUser = trpc.admin.suspendUser.useMutation({ onSuccess: refresh });
  const unsuspendUser = trpc.admin.unsuspendUser.useMutation({ onSuccess: refresh });
  const forceLogoutUser = trpc.admin.forceLogoutUser.useMutation();

  const detail = detailQuery.data;
  const isBusy = suspendUser.isPending || unsuspendUser.isPending;

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
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">USER DETAIL</p>
          <button type="button" onClick={onClose} aria-label="Хаах" className="rounded-full p-1.5 text-[#707176] transition hover:bg-[#f8f5ef]"><X size={16} /></button>
        </div>

        {detailQuery.isLoading && <p className="mt-6 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Ачаалж байна…</p>}
        {detailQuery.error && <p className="mt-6 rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{detailQuery.error.message}</p>}

        {detail && <>
          <h2 className="mt-3 font-[var(--font-display)] text-2xl font-semibold tracking-[-.05em]">{detail.name ?? "Нэр оруулаагүй"}</h2>
          <p className="mt-1 text-xs text-[#707176]">{detail.email}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${detail.role === "admin" ? "bg-[#fff0d2] text-[#9b6417]" : detail.role === "staff" ? "bg-[#e6f0fb] text-[#2c5a91]" : "bg-[#edf0f5] text-[#505d70]"}`}>{detail.role === "admin" ? "Admin" : detail.role === "staff" ? "Staff" : "User"}</span>
            {detail.suspendedAt ? <span className="rounded-full bg-[#fff0f2] px-2.5 py-1 text-[10px] font-extrabold text-[#a51630]">Түр хаагдсан</span> : <span className="rounded-full bg-[#e7f2ec] px-2.5 py-1 text-[10px] font-extrabold text-[#2c7650]">Идэвхтэй</span>}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#f8f5ef] p-4"><p className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">НИЙТ ЗАХИАЛГА</p><p className="mt-1 font-[var(--font-display)] text-xl font-semibold">{detail.orders.length}</p></div>
            <div className="rounded-2xl bg-[#f8f5ef] p-4"><p className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">НИЙТ ЗАРЦУУЛАЛТ</p><p className="mt-1 font-[var(--font-display)] text-xl font-semibold">{formatMnt(detail.totalSpentMnt)}</p></div>
          </div>

          <div className="mt-6 rounded-2xl border border-black/8 p-4">
            {detail.suspendedReason && <p className="mb-3 rounded-xl bg-[#fff0f2] px-3 py-2 text-xs leading-5 text-[#a51630]">Шалтгаан: {detail.suspendedReason}</p>}
            <div className="flex flex-wrap gap-2">
              {detail.suspendedAt
                ? <button type="button" disabled={isBusy} onClick={onUnsuspend} className="inline-flex items-center gap-1.5 rounded-full bg-[#2c7650] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{unsuspendUser.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <ShieldCheck size={14} />}Хандалт сэргээх</button>
                : <button type="button" disabled={isBusy} onClick={onSuspend} className="inline-flex items-center gap-1.5 rounded-full bg-[#df1f3d] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{suspendUser.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <ShieldAlert size={14} />}Түр хаах</button>}
              <button type="button" disabled={forceLogoutUser.isPending} onClick={onForceLogout} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-2 text-xs font-bold text-[#57585e] disabled:opacity-60">{forceLogoutUser.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <LogOut size={14} />}Бүх төхөөрөмжөөс гаргах</button>
            </div>
            {!detail.suspendedAt && <label className="mt-3 grid gap-1.5 text-xs font-bold">Түр хаах шалтгаан (сонголтоор)<input value={reason} onChange={event => setReason(event.target.value)} placeholder="ж: төлбөрийн маргаан" className="h-10 rounded-xl border border-black/10 px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>}
          </div>

          <div className="mt-6">
            <p className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">ЗАХИАЛГЫН ТҮҮХ</p>
            <div className="mt-3 grid gap-2">
              {detail.orders.map(order => (
                <div key={order.id} className="rounded-2xl border border-black/7 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#df1f3d]">{order.orderNumber}</span>
                    <span className="text-xs font-bold">{formatMnt(order.totalMnt)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#77787d]">
                    <span>{statusLabels[order.status] ?? order.status}</span>
                    <span>{new Date(order.createdAt).toLocaleDateString("mn-MN")}</span>
                  </div>
                </div>
              ))}
              {detail.orders.length === 0 && <p className="rounded-2xl bg-[#f8f5ef] px-3 py-6 text-center text-xs text-[#707176]">Захиалгын түүх алга.</p>}
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}
