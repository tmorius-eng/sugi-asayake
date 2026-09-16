import { useCallback, useState, useSyncExternalStore } from "react";
import { MonitorDown, Share, SquarePlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/useLocale";
import { getInstallAvailability, promptInstall, subscribeInstallState } from "@/lib/pwaInstall";

/**
 * "Аппаар суулгах" товч (2026-09-16, Tom: *"Ene website aa pc desktop deer
 * install app feature eer install hiigeed bas utsan deeree install hiideg
 * bolgmoor bainaaa"*).
 *
 * Сайт 2026-09-13-аас хойш техникийн хувьд бүрэн суулгагдахуйц байсан ч
 * суулгах гарц хаана ч байгаагүй. Дэлгэрэнгүй шалтгаан (хөтөч бүр өөр
 * биеэ авч явдаг) `lib/pwaInstall.ts`-ийн толгойд.
 *
 * ⚠️ Энэ нь SiteFooter-ийн "app-store download badges оруулахгүй" гэсэн
 * NEWVISION §9-ийн дүрмийг зөрчихгүй: App Store/Play Store-ийн лого биш,
 * байхгүй апп руу заасан холбоос ч биш — хөтчийн өөрийнх нь суулгах
 * үйлдлийг дуудаж, яг энэ сайтыг цонх болгон суулгана.
 */
export default function InstallAppButton() {
  const t = useT();
  const [help, setHelp] = useState<null | "ios" | "manual">(null);
  const availability = useSyncExternalStore(subscribeInstallState, getInstallAvailability, () => "unavailable" as const);

  const install = useCallback(async () => {
    // iOS дээр дуудах цонх байхгүй тул шууд заавар руу.
    if (availability === "ios") { setHelp("ios"); return; }
    const outcome = await promptInstall();
    // Татгалзсан үед товч алга болохоос илүү, хэрхэн буцаж суулгахыг зааж
    // өгөх нь зөв: эвент зарцуулагдсан тул дахин дуудаж болохгүй.
    if (outcome !== "accepted") setHelp("manual");
  }, [availability]);

  if (availability === "installed") return null;
  const canOffer = availability === "prompt" || availability === "ios";
  // ⚠️ `canOffer` дангаараа буцаах нөхцөл БОЛОХГҮЙ (2026-09-16, E2E барьсан):
  // `promptInstall()` нь эвентээ зарцуулмагц төлөв "unavailable" болдог тул
  // хэрэглэгч татгалзсан яг тэр агшинд энэ компонент бүхэлдээ салж, заавар
  // хэзээ ч гарахгүй байв. Цонх нээлттэй бол үлдэнэ.
  if (!canOffer && !help) return null;

  return (
    <>
      {canOffer && (
        <button type="button" className="footer-install" onClick={() => void install()}>
          <MonitorDown size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>{t("Аппаар суулгах")}</span>
        </button>
      )}
      <InstallHelpDialog open={help !== null} onClose={() => setHelp(null)} ios={help === "ios"} />
    </>
  );
}

/**
 * Гараар суулгах заавар. Гурван тохиолдол: iOS Safari (цонх огт байхгүй),
 * Android (цэсний "Апп суулгах"), компьютер (хаягийн мөрний дүрс).
 */
function InstallHelpDialog({ open, onClose, ios }: { open: boolean; onClose: () => void; ios: boolean }) {
  const t = useT();
  const android = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

  const steps = ios
    ? [t("Доод талын Хуваалцах товчийг дарна"), t("\"Нүүр дэлгэцэд нэмэх\" гэснийг сонгоно"), t("\"Нэмэх\" дарвал дүрс нүүр дэлгэцэд суулаа")]
    : android
      ? [t("Баруун дээд буланд байрлах ⋮ цэсийг дарна"), t("\"Апп суулгах\" эсвэл \"Нүүр дэлгэцэд нэмэх\" гэснийг сонгоно"), t("Баталгаажуулбал дүрс утсандаа суулаа")]
      : [t("Хаягийн мөрний баруун талд байх суулгах дүрсийг дарна"), t("Эсвэл ⋮ цэс → \"Хадгалах ба хуваалцах\" → \"Хуудсыг апп болгон суулгах\""), t("Баталгаажуулбал ширээний компьютерт тусдаа цонх болж нээгдэнэ")];

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogTitle>{t("Аппаар суулгах")}</DialogTitle>
        <DialogDescription>
          {ios
            ? t("iPhone, iPad дээр Safari өөрөө суулгах цонх гаргадаггүй тул гараар нэмнэ. Ердөө гурван алхам:")
            : t("Хөтчөөс дамжуулан хэдийд ч суулгаж болно. Ердөө гурван алхам:")}
        </DialogDescription>
        <ol className="mt-1 grid gap-3">
          {steps.map((step, index) => (
            <li className="flex items-start gap-3 text-[14px] leading-relaxed" key={step}>
              <span className="mt-[1px] grid size-6 shrink-0 place-items-center rounded-full bg-[#17181b] text-[12px] font-bold text-white">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-1 flex items-center gap-2 text-[13px] text-[#6b7078]">
          {ios ? <Share size={15} aria-hidden="true" /> : <SquarePlus size={15} aria-hidden="true" />}
          <span>{t("Суулгасны дараа сайт тусдаа цонхоор нээгдэж, офлайн үед ч эхэлнэ.")}</span>
        </p>
      </DialogContent>
    </Dialog>
  );
}
