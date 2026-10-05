import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Monitor, Moon, RotateCw, Smartphone, Sun } from "lucide-react";
import type { ThemeLook } from "@shared/theme-tokens";
import { previewVars } from "./tokenMeta";

/**
 * Амьд урьдчилан харах (Брэнд студи, 2026-10-05). Бодит storefront-ийг `?brandPreview=1`-ээр
 * iframe-д ачаалж, өнгө хөдлөх бүрт postMessage-ээр CSS хувьсагч илгээнэ — хуудас дахин
 * ачаалахгүй (client/src/components/BrandPreviewBridge.tsx хүлээн авна). Same-origin л
 * (security.ts: frame-ancestors 'self'), хоёр тал origin-оо шалгана.
 */
export type PreviewDevice = "desktop" | "mobile";
const DEVICE_WIDTH: Record<PreviewDevice, number> = { desktop: 1366, mobile: 390 };
const FRAME_HEIGHT = 860;

export default function PreviewFrame({ look, mode, onModeChange, greeting, posterUrl, layout, effect, ornament }: {
  look: ThemeLook;
  mode: "light" | "dark";
  onModeChange: (mode: "light" | "dark") => void;
  /** undefined = хуудасны өөрийнх, null = мэндчилгээгүй */
  greeting?: string | null;
  /** undefined = хуудасны өөрийнх, null = баярын постергүй (hero-ийн жинхэнэ зураг) */
  posterUrl?: string | null;
  /** Нүүрний бүтцийн ноорог (A3) — undefined = хуудасны өөрийнх */
  layout?: unknown;
  /** Баярын чимэглэл (A4) — undefined = хуудасны өөрийнх */
  effect?: string;
  ornament?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [path, setPath] = useState("/");
  const [reloadKey, setReloadKey] = useState(0);
  const [box, setBox] = useState({ scale: 0.5, left: 0 });
  const scale = box.scale;

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Байрлал ч state-д: scale 1-д хязгаарлагдсан үед (өргөн дэлгэц + утас) контейнер өөрчлөгдөхөд
    // төвлөрөлт render-ийн ref уншилтаас хамаарахгүй.
    const measure = () => {
      const nextScale = Math.min(1, wrap.clientWidth / DEVICE_WIDTH[device]);
      setBox({ scale: nextScale, left: Math.max(0, (wrap.clientWidth - DEVICE_WIDTH[device] * nextScale) / 2) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [device]);

  // Хамгийн сүүлийн утгыг ref-д — iframe "ready" гэж хэлэхэд ч, өнгө хөдлөхөд ч ижил мессеж.
  const payloadRef = useRef<unknown>(null);
  payloadRef.current = { type: "brand-preview", mode, vars: previewVars(look, mode), fontBody: look.fontBody, fontDisplay: look.fontDisplay, greeting, posterUrl, layout, effect, ornament };
  const post = () => frameRef.current?.contentWindow?.postMessage(payloadRef.current, window.location.origin);

  const payloadKey = JSON.stringify(payloadRef.current);
  useEffect(() => {
    // Өнгө сонгогч чирэхэд секундэд олон удаа өөрчлөгдөнө — 60 мс-ийн сүүлийн утгыг л илгээнэ.
    const timer = setTimeout(post, 60);
    return () => clearTimeout(timer);
  }, [payloadKey]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type === "brand-preview-ready") post();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const width = DEVICE_WIDTH[device];
  return (
    <div className="admin-card flex min-w-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-[var(--a-soft)] p-1" role="group" aria-label="Төхөөрөмж">
          {(["desktop", "mobile"] as const).map(option => (
            <button key={option} type="button" onClick={() => setDevice(option)} aria-pressed={device === option}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition ${device === option ? "bg-[var(--a-card)] text-[var(--a-text)] shadow-sm" : "text-[var(--a-muted)]"}`}>
              {option === "desktop" ? <Monitor size={13} /> : <Smartphone size={13} />}{option === "desktop" ? "Компьютер" : "Утас"}
            </button>
          ))}
        </div>
        <select value={path} onChange={event => setPath(event.target.value)} aria-label="Хуудас" className="h-8 min-w-0 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-[11px] font-bold">
          <option value="/">Нүүр</option>
          <option value="/shop">Дэлгүүр</option>
          <option value="/about">Бидний тухай</option>
        </select>
        <p className="ml-auto text-[10px] font-extrabold tracking-[.14em] text-[var(--a-muted)]">АМЬД УРЬДЧИЛАН ХАРАХ</p>
        <button type="button" onClick={() => onModeChange(mode === "dark" ? "light" : "dark")} aria-label={mode === "dark" ? "Гэрэл горим" : "Харанхуй горим"}
          className="grid size-8 place-items-center rounded-full border border-[var(--a-border)] text-[var(--a-text-soft)] transition hover:bg-[var(--a-soft)]">
          {mode === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button type="button" onClick={() => setReloadKey(key => key + 1)} aria-label="Дахин ачаалах"
          className="grid size-8 place-items-center rounded-full border border-[var(--a-border)] text-[var(--a-text-soft)] transition hover:bg-[var(--a-soft)]">
          <RotateCw size={14} />
        </button>
      </div>
      <div ref={wrapRef} className="relative w-full overflow-hidden rounded-2xl border border-[var(--a-border)] bg-[var(--a-soft)]" style={{ height: Math.round(FRAME_HEIGHT * scale) }}>
        <iframe
          key={`${path}-${reloadKey}`}
          ref={frameRef}
          title="Сайтын урьдчилан харах"
          src={`${path}${path.includes("?") ? "&" : "?"}brandPreview=1`}
          onLoad={post}
          className="absolute left-0 top-0 origin-top-left border-0 bg-white"
          style={{ width, height: FRAME_HEIGHT, transform: `scale(${scale})`, left: box.left }}
        />
      </div>
    </div>
  );
}
