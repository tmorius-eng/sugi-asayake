import { useCallback, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, MonitorDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Suspense } from "react";
import type { GuidePlatform } from "@/components/InstallGuide";
import { lazyRetry } from "@/lib/lazyRetry";

// 2026-09-21: the guide (7 KB, iOS screenshots markup) is only ever shown
// after a click, so it leaves the main bundle and loads on demand.
const InstallGuide = lazyRetry(() => import("@/components/InstallGuide"));
import { useT } from "@/hooks/useLocale";
import { getInstallAvailability, promptInstall, subscribeInstallState } from "@/lib/pwaInstall";

/**
 * "Аппаар суулгах" товч (2026-09-16, Tom: *"Ene website aa pc desktop deer
 * install app feature eer install hiigeed bas utsan deeree install hiideg
 * bolgmoor bainaaa"*).
 *
 * Сайт 2026-09-13-аас хойш техникийн хувьд бүрэн суулгагдахуйц байсан ч
 * суулгах гарц хаана ч байгаагүй. Дэлгэрэнгүй шалтгаан (хөтөч бүр өөр
 * биеэ авч явдаг) `lib/pwaInstall.ts`-ийн толгойд, алхмын заавар
 * `InstallGuide.tsx`-д.
 *
 * ⚠️ Энэ нь SiteFooter-ийн "app-store download badges оруулахгүй" гэсэн
 * NEWVISION §9-ийн дүрмийг зөрчихгүй: App Store/Play Store-ийн лого биш,
 * байхгүй апп руу заасан холбоос ч биш — хөтчийн өөрийнх нь суулгах
 * үйлдлийг дуудаж, яг энэ сайтыг цонх болгон суулгана.
 */

function detectPlatform(): GuidePlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return /android/i.test(ua) ? "android" : "desktop";
}

/**
 * `variant`:
 *  - `"footer"` — хөлийн брэндийн баганад гарах дүүргэсэн товч.
 *  - `"row"` — утасны ☰ цэсний мөр. 2026-09-16, Tom: *"Суулгах сонголт
 *    алга?"* — товч зөвхөн footer-т байсан бөгөөд утсан дээр нүүр хуудасны
 *    хөл нь маш доор байдаг тул практикт олдохгүй байв. Утсан дээр хүн
 *    юмыг ☰ цэснээс хайдаг, тиймээс цэсний ХАМГИЙН ЭХНИЙ мөр болгов.
 */
export default function InstallAppButton({ variant = "footer", onAction }: { variant?: "footer" | "row"; onAction?: () => void } = {}) {
  const t = useT();
  const [guide, setGuide] = useState<GuidePlatform | null>(null);
  const availability = useSyncExternalStore(subscribeInstallState, getInstallAvailability, () => "unavailable" as const);

  const install = useCallback(async () => {
    onAction?.();
    // iOS дээр дуудах цонх байхгүй тул шууд заавар руу.
    if (availability === "ios") { setGuide("ios"); return; }
    const outcome = await promptInstall();
    // Татгалзсан үед товч алга болохоос илүү, хэрхэн буцаж суулгахыг зааж
    // өгөх нь зөв: эвент зарцуулагдсан тул дахин дуудаж болохгүй.
    if (outcome !== "accepted") setGuide(detectPlatform());
  }, [availability, onAction]);

  if (availability === "installed") return null;
  const canOffer = availability === "prompt" || availability === "ios";
  // ⚠️ `canOffer` дангаараа буцаах нөхцөл БОЛОХГҮЙ (2026-09-16, E2E барьсан):
  // `promptInstall()` нь эвентээ зарцуулмагц төлөв "unavailable" болдог тул
  // хэрэглэгч татгалзсан яг тэр агшинд энэ компонент бүхэлдээ салж, заавар
  // хэзээ ч гарахгүй байв. Цонх нээлттэй бол үлдэнэ.
  if (!canOffer && !guide) return null;

  return (
    <>
      {canOffer && (variant === "row" ? (
        <button type="button" className="commerce-mobile-menu-row" onClick={() => void install()}>
          <span className="flex items-center gap-2"><MonitorDown size={15} aria-hidden="true" />{t("Аппаар суулгах")}</span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="footer-install" onClick={() => void install()}>
          <MonitorDown size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>{t("Аппаар суулгах")}</span>
        </button>
      ))}

      <Dialog open={guide !== null} onOpenChange={value => { if (!value) setGuide(null); }}>
        <DialogContent className="max-w-md">
          <DialogTitle>{t("Аппаар суулгах")}</DialogTitle>
          <DialogDescription>
            {guide === "ios"
              ? t("iPhone, iPad дээр Safari өөрөө суулгах цонх гаргадаггүй тул гараар нэмнэ.")
              : t("Хөтчөөс дамжуулан хэдийд ч суулгаж болно.")}
          </DialogDescription>
          {guide && <Suspense fallback={null}><InstallGuide platform={guide} /></Suspense>}
        </DialogContent>
      </Dialog>
    </>
  );
}
