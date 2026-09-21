import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/hooks/useLocale";

/**
 * Апп суулгах алхам алхмын заавар (2026-09-16).
 *
 * Tom эхний хувилбарыг утсан дээрээ туршаад atsu.moe-ийн зааврыг үзүүлэв:
 * төхөөрөмжийн мөрийг зурж, дарах товчийг нь тойрог хүрээгээр тэмдэглэсэн,
 * нэг дор нэг алхам харуулдаг. Учир нь **гурван мөр текст хангалтгүй** —
 * хүн юун дээр дарахаа мэдэхгүй байна.
 *
 * ⚠️ Мөн эхний хувилбарын iOS-ийн заавар нь БУРУУ байсан: "доод талын
 * Хуваалцах товч" гэж бичсэн боловч орчин үеийн iOS Safari-д Хуваалцах нь
 * мөрөн дээр шууд БАЙХГҮЙ — эхлээд хаягийн мөрний ЗҮҮН талын хуудасны
 * цэсийг дарж, түүн дотроос "Share"-ийг сонгоно. Apple-ийн өөрийнх нь
 * заавар: "Tap the menu icon, then tap Share… scroll down the list of
 * options, then tap Add to Home Screen" (Apple Support, "Bookmark a website
 * in Safari on iPhone"). Хуучин байрлал (Хуваалцах нь мөрөн дээрээ) бас
 * тохиолддог тул хоёуланг нь сонгож болдог болгов — хэрэглэгч өөрийн
 * мөрөө хараад тааруулна, бид iOS-ийн хувилбарыг таамаглахгүй.
 *
 * Зураг нь бодит дэлгэцийн агшин БИШ, схем зураг: iOS төхөөрөмж бидэнд
 * байхгүй тул жинхэнэ screenshot авах аргагүй, харин дэлгэцийн агшин мэт
 * дүр эсгэсэн зураг нь худал мэдээлэл болно. Товчнуудын байрлал, нэр нь
 * бодитой — хүн өөрийн дэлгэцтэй нэг харцаар тааруулж чадна.
 */

export type GuidePlatform = "ios" | "android" | "desktop";

const PANEL = "#2f3033";
const MUTED = "#9aa0a6";

function Ring({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return <rect x={x} y={y} width={width} height={height} rx="11" fill="none" stroke="#8b5cf6" strokeWidth="2.5" />;
}

/** Жагсаалттай цэс (iOS-ийн хуудасны цэс, Хуваалцах хуудас, Chrome-ийн цэс). */
function ListArt({ rows, highlight }: { rows: string[]; highlight: number }) {
  return (
    <>
      <rect x="24" y="12" width="292" height={rows.length * 42 + 16} rx="18" fill={PANEL} />
      {rows.map((row, index) => {
        const top = 20 + index * 42;
        return (
          <g key={row}>
            <text x="44" y={top + 27} fill={index === highlight ? "#ffffff" : MUTED} fontSize="15" fontWeight={index === highlight ? 700 : 500}>{row}</text>
            <rect x="272" y={top + 10} width="22" height="22" rx="6" fill={index === highlight ? "#8b5cf6" : "#4a4b50"} />
            {index === highlight && <Ring x={34} y={top + 2} width={272} height={38} />}
          </g>
        );
      })}
    </>
  );
}

/**
 * 2026-09-20: эдгээр зураг дээрх домэйн, дэлгүүрийн нэр хатуу бичигдсэн байв —
 * домэйн эсвэл эзэн солиход утас дээрх суулгах заавар БУРУУ хаяг үзүүлнэ.
 * Одоо хөтчийн өөрийн хаягаас, толгойн `<title>`-ээс авна (энэ SVG-д hook
 * дуудахгүйн тулд энгийн функц — зурагдалт бүрт дахин уншина).
 */
const host = () => (typeof window === "undefined" ? "" : window.location.host);
const shopName = () => {
  if (typeof document === "undefined") return "";
  const title = document.title.split("—")[0]?.trim();
  return title || host();
};

/** iOS Safari-ийн доод мөр. `target` нь тэмдэглэх дүрсийг заана. */
function SafariBarArt({ target }: { target: "menu" | "share" }) {
  return (
    <>
      <circle cx="30" cy="60" r="21" fill={PANEL} />
      <path d="M34 53 L27 60 L34 67" fill="none" stroke={MUTED} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="60" y="39" width="220" height="42" rx="21" fill={PANEL} />
      {/* Хуудасны цэс: гурван зураас + жижиг дөрвөлжин (iOS-ийн "page menu"). */}
      <g stroke={target === "menu" ? "#ffffff" : MUTED} strokeWidth="2.2" strokeLinecap="round">
        <path d="M76 53 h18" /><path d="M80 60 h14" /><path d="M76 67 h18" />
      </g>
      <rect x="72" y="50" width="6" height="6" rx="1.5" fill={target === "menu" ? "#ffffff" : MUTED} />
      <text x="180" y="66" textAnchor="middle" fill="#e6e6e6" fontSize="15" fontWeight="600">{host()}</text>
      {/* Хуучин байрлалд Хуваалцах дүрс мөрөн дээрээ байдаг. */}
      {target === "share" && (
        <g>
          <rect x="246" y="50" width="16" height="20" rx="3" fill="none" stroke="#ffffff" strokeWidth="2" />
          <path d="M254 46 v13 M250 50 l4 -4 l4 4" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      <circle cx="310" cy="60" r="21" fill={PANEL} />
      <rect x="301" y="52" width="13" height="13" rx="3" fill="none" stroke={MUTED} strokeWidth="2" />
      <rect x="306" y="57" width="13" height="13" rx="3" fill={PANEL} stroke={MUTED} strokeWidth="2" />
      {target === "menu"
        ? <Ring x={65} y={44} width={38} height={32} />
        : <Ring x={238} y={44} width={32} height={32} />}
    </>
  );
}

/** Chrome-ийн дээд мөр (Android ба компьютер). */
function ChromeBarArt({ target }: { target: "menu" | "install" }) {
  return (
    <>
      <rect x="24" y="38" width="240" height="44" rx="22" fill={PANEL} />
      <text x="52" y="66" fill="#e6e6e6" fontSize="15" fontWeight="600">{host()}</text>
      {/* Компьютерийн Chrome-д хаягийн мөрний баруун талд суулгах дүрс гарна. */}
      <g stroke={target === "install" ? "#ffffff" : MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <rect x="228" y="50" width="22" height="18" rx="3" />
        <path d="M239 54 v8 M235 58 l4 4 l4 -4" />
      </g>
      <g fill={target === "menu" ? "#ffffff" : MUTED}>
        <circle cx="300" cy="50" r="2.6" /><circle cx="300" cy="60" r="2.6" /><circle cx="300" cy="70" r="2.6" />
      </g>
      {target === "install" ? <Ring x={223} y={44} width={32} height={32} /> : <Ring x={285} y={44} width={30} height={32} />}
    </>
  );
}

/** Баталгаажуулах жижиг цонх ("Add" / "Install"). */
function ConfirmArt({ action }: { action: string }) {
  return (
    <>
      <rect x="34" y="26" width="272" height="118" rx="18" fill={PANEL} />
      <rect x="54" y="52" width="46" height="46" rx="12" fill="#b01729" />
      <text x="77" y="82" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="700">S</text>
      <text x="116" y="70" fill="#ffffff" fontSize="15" fontWeight="700">{shopName()}</text>
      <text x="116" y="92" fill={MUTED} fontSize="13">{host()}</text>
      <rect x="216" y="112" width="74" height="26" rx="13" fill="#8b5cf6" />
      <text x="253" y="130" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="700">{action}</text>
      <Ring x={210} y={106} width={86} height={38} />
    </>
  );
}

function Frame({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-[#17181b] p-2">
      <svg viewBox={`0 0 340 ${height}`} className="w-full" role="presentation" focusable="false">{children}</svg>
    </div>
  );
}

type Step = { caption: string; art: ReactNode };

export default function InstallGuide({ platform }: { platform: GuidePlatform }) {
  const t = useT();
  // iOS-ийн хоёр байрлал. Anhдагчаар шинэ байрлал (цэсний дүрс) — Apple-ийн
  // одоогийн заавар түүнийг зааж байгаа; хуучин байрлалыг хэрэглэгч өөрөө
  // сонгоно. iOS-ийн хувилбарын дугаараар таамаглахгүй: хүн өөрийн мөрөө
  // хараад аль нь болохыг нэг харцаар мэднэ.
  const [iosLayout, setIosLayout] = useState<"menu" | "share">("menu");
  const [index, setIndex] = useState(0);

  const steps: Step[] = platform === "ios"
    ? iosLayout === "menu"
      ? [
        { caption: t("Хаягийн мөрний ЗҮҮН талд байх хуудасны цэсийн дүрсийг дарна"), art: <Frame height={120}><SafariBarArt target="menu" /></Frame> },
        { caption: t("Нээгдсэн цэснээс \"Share\" (Хуваалцах) гэснийг сонгоно"), art: <Frame height={196}><ListArt rows={["Share", "Add to Bookmarks", "Find on Page", "Hide Toolbar"]} highlight={0} /></Frame> },
        { caption: t("Доош гүйлгээд \"Add to Home Screen\" гэснийг дарна"), art: <Frame height={196}><ListArt rows={["Add to Favorites", "Find on Page", "Add to Home Screen", "Markup"]} highlight={2} /></Frame> },
        { caption: t("Баруун дээд буланд байх \"Add\" товчийг дарвал дүрс нүүр дэлгэцэд суулаа"), art: <Frame height={170}><ConfirmArt action="Add" /></Frame> },
      ]
      : [
        { caption: t("Доод мөрөн дэх Хуваалцах дүрсийг дарна (дөрвөлжин дээш сум)"), art: <Frame height={120}><SafariBarArt target="share" /></Frame> },
        { caption: t("Доош гүйлгээд \"Add to Home Screen\" гэснийг дарна"), art: <Frame height={196}><ListArt rows={["Add to Favorites", "Find on Page", "Add to Home Screen", "Markup"]} highlight={2} /></Frame> },
        { caption: t("Баруун дээд буланд байх \"Add\" товчийг дарвал дүрс нүүр дэлгэцэд суулаа"), art: <Frame height={170}><ConfirmArt action="Add" /></Frame> },
      ]
    : platform === "android"
      ? [
        { caption: t("Баруун дээд буланд байх ⋮ цэсийг дарна"), art: <Frame height={120}><ChromeBarArt target="menu" /></Frame> },
        { caption: t("\"Install app\" эсвэл \"Add to Home screen\" гэснийг сонгоно"), art: <Frame height={196}><ListArt rows={["New tab", "Bookmarks", "Install app", "Downloads"]} highlight={2} /></Frame> },
        { caption: t("\"Install\" дарвал дүрс утсандаа суулаа"), art: <Frame height={170}><ConfirmArt action="Install" /></Frame> },
      ]
      : [
        { caption: t("Хаягийн мөрний баруун талд байх суулгах дүрсийг дарна"), art: <Frame height={120}><ChromeBarArt target="install" /></Frame> },
        { caption: t("Харагдахгүй бол ⋮ цэс → \"Cast, save and share\" → \"Install page as app\""), art: <Frame height={196}><ListArt rows={["New tab", "Bookmarks", "Cast, save and share", "Settings"]} highlight={2} /></Frame> },
        { caption: t("\"Install\" дарвал сайт тусдаа цонх болж нээгдэнэ"), art: <Frame height={170}><ConfirmArt action="Install" /></Frame> },
      ];

  const step = steps[Math.min(index, steps.length - 1)];
  const go = (delta: number) => setIndex(current => Math.min(steps.length - 1, Math.max(0, current + delta)));

  return (
    <div className="grid gap-3">
      {platform === "ios" && (
        <div className="grid grid-cols-2 gap-1 rounded-full bg-[#eceff0] p-1" role="tablist" aria-label={t("Хаягийн мөрний хэлбэр")}>
          {([["menu", t("Цэсний дүрстэй")], ["share", t("Хуваалцах дүрстэй")]] as const).map(([value, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={iosLayout === value}
              key={value}
              onClick={() => { setIosLayout(value); setIndex(0); }}
              className={`rounded-full px-3 py-[7px] text-[13px] font-bold transition-colors ${iosLayout === value ? "bg-[#17181b] text-white" : "text-[#545958]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {step.art}

      <p className="min-h-[42px] text-[14px] font-semibold leading-relaxed text-[#17181b]">{step.caption}</p>

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} disabled={index === 0} className="flex size-9 items-center justify-center rounded-full border border-[#d8dcda] text-[#17181b] disabled:opacity-35" aria-label={t("Өмнөх алхам")}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className="text-[13px] font-bold text-[#545958]">{`${index + 1} / ${steps.length}`}</span>
        <button type="button" onClick={() => go(1)} disabled={index === steps.length - 1} className="flex size-9 items-center justify-center rounded-full border border-[#d8dcda] text-[#17181b] disabled:opacity-35" aria-label={t("Дараагийн алхам")}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
