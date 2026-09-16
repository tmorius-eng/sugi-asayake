/**
 * "Аппаар суулгах" (PWA install) — төлөв барих давхарга (2026-09-16).
 *
 * Сайт 2026-09-13-аас хойш бүрэн суулгагдахуйц PWA байсан (manifest, 192/512
 * ба maskable дүрс, `fetch` боловсруулагчтай service worker, HTTPS) — гэвч
 * **хаана ч суулгах товч байгаагүй**, тиймээс хэн ч суулгаж чадахгүй байв.
 * Хөтөч бүр өөрөөр биеэ авч явдаг:
 *
 *  - **Компьютер дээрх Chrome/Edge**: хаягийн мөрөнд жижиг дүрс гарна. Tom
 *    үүнийг олж хараагүй — энэ модулийн гол шалтгаан.
 *  - **Android Chrome**: 2019 (Chrome 76)-аас хойш хөтөч өөрөө урьдаг
 *    туузыг ХАССАН. Сайт өөрөө `beforeinstallprompt`-ийг барьж, өөрийн
 *    товчноосоо `prompt()` дуудахгүй бол суулгах цонх хэзээ ч гарахгүй.
 *  - **iOS Safari**: `beforeinstallprompt` эвент ОГТ БАЙХГҮЙ. Ганц зам нь
 *    Хуваалцах → "Нүүр дэлгэцэд нэмэх" бөгөөд үүнийг зааж өгөхөөс өөр
 *    аргагүй. Тиймээс энд "боломжгүй" биш, "заавар үзүүлэх" төлөв хэрэгтэй.
 *
 * Эвентийг React mount хийхээс ӨМНӨ барих ёстой (`main.tsx` дуудна): Chrome
 * үүнийг маш эрт, ихэвчлэн эхний render-ээс өмнө шиддэг тул компонент дотор
 * сонсоход хожимддог.
 */

export type InstallAvailability =
  /** Аль хэдийн суулгасан — эсвэл суулгасан цонхон дотроос үзэж байна. */
  | "installed"
  /** Хөтөч суулгах эрх өгсөн: өөрсдийн товчноос жинхэнэ цонхыг нээж болно. */
  | "prompt"
  /** iOS Safari: автомат цонх байхгүй, зөвхөн гараар нэмэх заавар. */
  | "ios"
  /** Энэ хөтөч дээр суулгах боломжгүй (жишээ: компьютер дээрх Firefox). */
  | "unavailable";

/**
 * `beforeinstallprompt` нь одоогоор ямар ч стандартад ороогүй тул TypeScript-ийн
 * DOM тодорхойлолтод байхгүй. Төсөлд өөр global Window augmentation нэг л газар
 * бий (`lib/cookieConsent.ts`) — түүнтэй ижил хэлбэрээр зарлана.
 */
export type BeforeInstallPromptEvent = Event & {
  readonly platforms: readonly string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let watching = false;
const listeners = new Set<() => void>();

const emit = () => { for (const listener of listeners) listener(); };

/**
 * Суулгасан цонхон дотор ажиллаж байгаа эсэх. iOS Safari нь `display-mode`
 * media query-г удаан хугацаанд дэмждэггүй байсан тул түүний өөрийн
 * `navigator.standalone`-ийг мөн шалгана. `window-controls-overlay` нь
 * компьютерийн суулгасан цонхны шинэ хэлбэр.
 */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (iosStandalone) return true;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: window-controls-overlay)").matches;
}

/**
 * iPadOS 13-аас хойш iPad нь өөрийгөө "Macintosh" гэж танилцуулдаг тул
 * user agent дангаараа хангалтгүй — мэдрэгчтэй эсэхээр нь ялгана.
 */
function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** `main.tsx`-ээс НЭГ УДАА, React render-ээс өмнө дуудагдана. */
export function startInstallWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  installed = isStandalone();

  window.addEventListener("beforeinstallprompt", event => {
    // preventDefault() нь Android-ын өөрийнх нь жижиг туузыг зогсоож, эвентийг
    // бидний товч дуудах хүртэл хүчинтэй хэвээр үлдээнэ.
    event.preventDefault();
    deferred = event;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });

  // Суулгасны дараа хэрэглэгч тэр цонх руу шилжихэд товч шууд алга болно.
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", event => {
    if (event.matches) { installed = true; emit(); }
  });
}

export function getInstallAvailability(): InstallAvailability {
  if (installed) return "installed";
  if (deferred) return "prompt";
  if (isIos()) return "ios";
  return "unavailable";
}

export function subscribeInstallState(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Жинхэнэ суулгах цонхыг нээнэ.
 *
 * ⚠️ Эвент нэг л удаа ашиглагдана (тодорхойлолтын шаардлага) — тиймээс
 * дуудсаны дараа хаяна. Хэрэглэгч татгалзвал хөтөч дараагийн айлчлал дээр
 * шинэ эвент шиднэ; тэр болтол товч "заавар" горимд шилжинэ.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  emit();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    // Хөтөч цонхыг нээж чадаагүй (жишээ: хэрэглэгчийн үйлдлээс салсан дуудлага).
    return "dismissed";
  }
}
