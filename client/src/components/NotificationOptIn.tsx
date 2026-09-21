import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Bell } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { lazyRetry } from "@/lib/lazyRetry";

// 2026-09-21: on demand, same reason as in InstallAppButton.tsx.
const InstallGuide = lazyRetry(() => import("@/components/InstallGuide"));
import { useT } from "@/hooks/useLocale";
import { currentPushSubscription, pushSupport, subscribeToPush, type PushSupport } from "@/lib/push";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * "Мэдэгдэл авах" — зөвшөөрөл асуух гарц (2026-09-16).
 *
 * Tom: *"Утаснаас орж байгаа хүмүүс хэрвээ notification allow сонголт
 * хийчвэл browser-оо хаасан ч утсан дээр нь notification ирдэг болгмоор
 * байна, бас desktop PC ялгаагүй!"*
 *
 * Web Push-ийн сервер тал 2026-09-13-аас бүрэн ажилладаг (VAPID түлхүүр
 * production-д тохируулагдсан, захиалгын төлөв/орхисон сагс/сэтгэгдлийн
 * хүсэлт бүгд `sendPushToUser`-ээр явдаг) бөгөөд хөтөч хаагдсан үед ч
 * ирдэг — энэ бол Web Push-ийн үндсэн зан төлөв. Дутуу байсан ганц зүйл нь
 * **зөвшөөрөл асуух гарц**: тэр нь зөвхөн /profile → Тохиргоо доторх
 * шилжүүлэгч байсан тул хэн ч олохгүй байв.
 *
 * Хоёр тусгай тохиолдлыг заавал зөв шийднэ:
 *  - **iPhone**: iOS 16.4-өөс хойш Web Push ажилладаг ч ЗӨВХӨН нүүр
 *    дэлгэцэд суулгасан апп дотор. Энгийн Safari таб дээр `PushManager`
 *    огт байхгүй тул эхлээд суулгах ёстой — үүнийг зааж өгнө
 *    ([[InstallGuide]]-ийг дахин ашиглана).
 *  - **Нэвтрээгүй**: захиалгын мэдэгдэл хэрэглэгчид холбогддог тул
 *    (`push.subscribe` нь protected) нэвтрэх шаардлагатайг тайлбарлана.
 *    Чимээгүй бүтэлгүйтэхгүй.
 */
/**
 * ⚠️ Бүртгэлийн төлөв нь МОДУЛИЙН хэмжээнд, компонент бүрт биш (2026-09-16).
 *
 * Товч хоёр газар зурагддаг (☰ цэс ба footer). Төлөв нь компонент бүрт
 * тусдаа байсан тул цэснээс асаасны дараа footer-ийнх нь "асаагаагүй" гэж
 * үлдэж, дахин дарахад ДАХИН нэг туршилтын мэдэгдэл илгээгддэг байв. Tom-ийн
 * дэлгэц дээр яг ижил мэдэгдэл 5 удаа давхарласан нь үүний бодит үр дүн.
 * `busy` нь мөн энд: нэг дарсны дараа хоёр товч хоёулаа түгжигдэнэ.
 */
let sharedSubscribed: boolean | null = null;
let sharedBusy = false;
const stateListeners = new Set<() => void>();
const emitState = () => { for (const listener of stateListeners) listener(); };
const subscribeState = (listener: () => void) => { stateListeners.add(listener); return () => { stateListeners.delete(listener); }; };
const stateSnapshot = () => `${sharedSubscribed}|${sharedBusy}`;

export default function NotificationOptIn({ variant = "footer", onAction }: { variant?: "footer" | "row"; onAction?: () => void } = {}) {
  const t = useT();
  const { user } = useAuth();
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [dialog, setDialog] = useState<null | "needs-install" | "denied" | "login">(null);
  useSyncExternalStore(subscribeState, stateSnapshot, () => "null|false");
  const subscribed = sharedSubscribed;
  const busy = sharedBusy;
  const keyQuery = trpc.push.publicKey.useQuery(undefined, { staleTime: 10 * 60_000 });
  const subscribe = trpc.push.subscribe.useMutation();
  const test = trpc.push.test.useMutation();

  // `pushSupport()` нь navigator-оос уншдаг тул render дотор биш effect-д:
  // сервер талын render (байхгүй ч) болон hydration-ий зөрүүнээс сэргийлнэ.
  useEffect(() => {
    setSupport(pushSupport());
    if (sharedSubscribed === null) {
      void currentPushSubscription().then(sub => { sharedSubscribed = Boolean(sub); emitState(); });
    }
  }, []);

  const enable = useCallback(async () => {
    if (sharedBusy) return;
    onAction?.();
    // Дараалал санаатай: (1) төхөөрөмжийн хатуу хориг — iPhone дээр
    // суулгаагүй бол юу ч хийж болохгүй, (2) манай өөрсдийн урьдчилсан
    // нөхцөл — мэдэгдэл дансанд холбогддог тул нэвтрэх шаардлагатай, энэ нь
    // аппаас нэг товшилтоор засагддаг, (3) хөтчийн гадаад тохиргоо. Эхний
    // хувилбарт (3) нь (2)-оос өмнө байсан тул нэвтрээгүй хүн хөтчийн
    // тохиргоо руу дэмий явуулагдаж байв.
    if (support === "needs-install") { setDialog("needs-install"); return; }
    if (!user) { setDialog("login"); return; }
    if (support === "denied") { setDialog("denied"); return; }
    const key = keyQuery.data?.key;
    if (!key) { toast.error(t("Мэдэгдэл одоогоор тохируулагдаагүй байна.")); return; }
    // Товчийг ЭНД түгжинэ — зөвшөөрлийн цонх гарч ирэх хүртэл хэдэн секунд
    // өнгөрдөг бөгөөд тэр зуур хүн дахин дардаг (Tom-ийн 5 давхардсан
    // мэдэгдлийн шалтгаан).
    sharedBusy = true; emitState();
    try {
      const sub = await subscribeToPush(key);
      // Зөвшөөрөл асуухад "Block" дарсан бол хөтөч дахин асуухгүй — тохиргооноос
      // нь буцааж нээхийг зааж өгөх нь ганц бодит гарц.
      if (!sub) { setSupport(pushSupport()); setDialog("denied"); return; }
      await subscribe.mutateAsync(sub);
      sharedSubscribed = true; emitState();
      // Шууд нэг мэдэгдэл илгээж, хүн ажиллаж байгааг НҮДЭЭР хардаг байх —
      // "асаалаа" гэсэн toast нь юу ч баталгаажуулдаггүй.
      const delivered = await test.mutateAsync().catch(() => ({ delivered: 0 }));
      toast.success(delivered.delivered > 0
        ? t("Мэдэгдэл асаалаа — туршилтын мэдэгдэл илгээлээ.")
        : t("Мэдэгдэл асаалаа."));
    } finally {
      sharedBusy = false; emitState();
    }
  }, [keyQuery.data?.key, onAction, subscribe, support, t, test, user]);

  // Тохируулагдаагүй сервер, дэмждэггүй хөтөч, эсвэл аль хэдийн асаалттай
  // бол юу ч зурахгүй — ажиллахгүй товч үзүүлэх нь худал амлалт.
  if (!keyQuery.data?.key) return null;
  if (support === "unsupported") return null;
  if (subscribed === null || subscribed) return null;

  const label = t("Мэдэгдэл авах");

  return (
    <>
      {variant === "row" ? (
        <button type="button" className="commerce-mobile-menu-row" disabled={busy} onClick={() => void enable()}>
          <span className="flex items-center gap-2"><Bell size={15} aria-hidden="true" />{label}</span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="footer-notify" disabled={busy} onClick={() => void enable()}>
          <Bell size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>{label}</span>
        </button>
      )}

      <Dialog open={dialog !== null} onOpenChange={value => { if (!value) setDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogTitle>{label}</DialogTitle>
          {dialog === "needs-install" && (
            <>
              <DialogDescription>
                {t("iPhone, iPad дээр мэдэгдэл авахын тулд эхлээд сайтыг нүүр дэлгэцэд нэмэх шаардлагатай — Safari таб дотроос мэдэгдэл ирдэггүй. Нэмсэний дараа тэр дүрснээс нээгээд дахин оролдоно уу.")}
              </DialogDescription>
              <Suspense fallback={null}><InstallGuide platform="ios" /></Suspense>
            </>
          )}
          {dialog === "denied" && (
            <>
              <DialogDescription>
                {t("Энэ хөтөч дээр мэдэгдэл хаагдсан байна. Хөтчийн тохиргооноос буцааж зөвшөөрөх хэрэгтэй:")}
              </DialogDescription>
              <ol className="grid gap-2 text-[14px] leading-relaxed">
                <li>{t("1. Хаягийн мөрөн дэх цоожны (эсвэл тохиргооны) дүрсийг дарна")}</li>
                <li>{t("2. \"Мэдэгдэл\" (Notifications) хэсгийг олно")}</li>
                <li>{t("3. \"Зөвшөөрөх\" (Allow) болгож сольсны дараа хуудсаа шинэчилнэ")}</li>
              </ol>
            </>
          )}
          {dialog === "login" && (
            <>
              <DialogDescription>
                {t("Мэдэгдэл нь таны захиалгын явцтай холбогддог тул эхлээд нэвтэрсэн байх шаардлагатай.")}
              </DialogDescription>
              <Link href="/login" className="inline-flex w-fit items-center rounded-full bg-[#17181b] px-4 py-2 text-[14px] font-bold text-white" onClick={() => setDialog(null)}>
                {t("Нэвтрэх")}
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
