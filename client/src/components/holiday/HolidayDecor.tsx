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
  const [ready, setReady] = useState(() => typeof document !== "undefined" && document.readyState === "complete");
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
