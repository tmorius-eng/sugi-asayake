import { lazy, Suspense, useEffect, useState } from "react";
import { ornamentDataUri } from "@shared/holiday-decor";
import { useHolidayDecor } from "@/lib/holidayDecor";

const HolidayEffect = lazy(() => import("./HolidayEffect"));

/**
 * Хөдөлгөөнт эффект — хуудас `load` болсны ДАРАА л chunk-ийг татна (LCP-ээс хойш), хөдөлгөөн
 * багасгах тохиргоотой хэрэглэгчид огт гарахгүй. Брэнд студийн preview-д (BrandPreviewBridge)
 * шууд гарна.
 */
export function HolidayEffectMount() {
  const { effect } = useHolidayDecor();
  // Брэнд студийн урьдчилан харалт (admin-ий iframe, `?brandPreview`) хуудас ачаалж дуустал хүлээхгүй:
  // 2026-10-06-аас App-д mount хийгддэг тул Home-д байснаас эрт — `load` (hero-ийн том зураг) хүртэл хүлээвэл
  // preview-ийн цас хоцорно. Жинхэнэ зочинд LCP-ийн дараа гэсэн дүрэм хэвээр.
  const inPreview = typeof window !== "undefined" && window.parent !== window && new URLSearchParams(window.location.search).has("brandPreview");
  const [ready, setReady] = useState(() => inPreview || (typeof document !== "undefined" && document.readyState === "complete"));
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  useEffect(() => {
    if (ready) return;
    const onLoad = () => window.setTimeout(() => setReady(true), 1500);
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, [ready]);

  if (effect === "none" || reduced || !ready) return null;
  return <Suspense fallback={null}><HolidayEffect key={effect} kind={effect} /></Suspense>;
}

/** Hero-ийн доорх хээний зурвас (mask-image → өнгө нь брэндийн алтлаг токен). */
export function HolidayOrnamentBand() {
  const { ornament } = useHolidayDecor();
  if (ornament === "none") return null;
  const mask = ornamentDataUri(ornament);
  return (
    <div
      className="holiday-ornament"
      aria-hidden="true"
      data-holiday-ornament={ornament}
      style={{ WebkitMaskImage: mask, maskImage: mask }}
    />
  );
}
