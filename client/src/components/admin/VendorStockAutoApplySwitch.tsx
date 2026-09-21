import { LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getStoreSettingSlot } from "@shared/store-settings";

import { useConfirm } from "@/components/ConfirmDialog";
/**
 * The one switch that decides whether the vendor's stock figures post by
 * themselves (2026-09-15, Tom's call: they do).
 *
 * It lives here rather than in Дэлгүүрийн тохиргоо because this is where a
 * person is looking when they ask "is this automatic?" -- and it is a
 * store_settings row, so turning it off needs no deploy. VENDOR_SYNC_GROUP
 * keeps the same key out of the generic settings accordion, so there is
 * exactly one place to change it.
 */
const KEY = "vendor-stock-auto-apply" as const;

export default function VendorStockAutoApplySwitch() {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const settingsQuery = trpc.admin.storeSettings.useQuery();
  const updateSetting = trpc.admin.updateStoreSetting.useMutation();

  const slot = getStoreSettingSlot(KEY);
  const saved = (settingsQuery.data ?? []).find((row: { settingKey: string; settingValue: string }) => row.settingKey === KEY)?.settingValue;
  const on = (saved ?? slot.fallbackValue).trim() !== "0";

  const toggle = async () => {
    const next = on ? "0" : "1";
    if (on && !await confirm({ title: "Автоматыг унтраах уу? Үүний дараа татсан үлдэгдэл бүрийг Бараа хүлээн авах → Тооллого дээр гараар батлах шаардлагатай болно.", danger: true })) return;
    try {
      await updateSetting.mutateAsync({ settingKey: KEY, settingValue: next });
      await Promise.all([utils.admin.storeSettings.invalidate(), utils.content.storeSettings.invalidate()]);
      toast.success(next === "1" ? "Үлдэгдэл автоматаар бичигдэнэ." : "Үлдэгдэл батлуулах болов.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Хадгалж чадсангүй.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-[var(--a-soft)] px-3 py-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Үлдэгдлийг автоматаар бичих"
        disabled={settingsQuery.isLoading || updateSetting.isPending}
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-[var(--a-pos)]" : "bg-[var(--a-border-strong)]"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
      <span className="text-[11px] font-extrabold">
        {updateSetting.isPending ? <LoaderCircle className="inline animate-spin" size={12} /> : on ? "Үлдэгдэл автоматаар бичигдэнэ" : "Үлдэгдэл батлуулна"}
      </span>
      <span className="min-w-0 flex-1 text-[11px] leading-4 text-[var(--a-muted)]">
        {on
          ? "Татсан зөрүү шууд нөөц болно. Өөрчлөлт бүр бүртгэлд үлдэж, Бараа хүлээн авах → Тооллого дээр түүх болж харагдана."
          : "Татсан зөрүү бүр Бараа хүлээн авах → Тооллого дээр батлахыг хүлээнэ."}
      </span>
      {on && (
        <span className="flex w-full items-start gap-1.5 text-[11px] leading-4 text-[var(--a-muted)]">
          <TriangleAlert size={12} className="mt-0.5 shrink-0 text-[var(--a-warn)]" />
          Вендорын жагсаалт гэнэт эрс багасвал (Smart Retail дээрх "ECommerce борлуулах бараа" тохиргоо салсан гэх мэт) автоматаар бичихээ больж, утсанд мэдэгдэнэ.
        </span>
      )}
    </div>
  );
}
