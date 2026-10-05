import { useEffect, useMemo, useState } from "react";
import type { HolidayEffect as EffectKind } from "@shared/holiday-decor";

/**
 * Баярын хөдөлгөөнт чимэглэл (Брэнд студи A4, 2026-10-05) — зөвхөн CSS, 26 жижиг элемент, хулганы
 * товшилтыг хаахгүй (pointer-events: none). Тусдаа chunk (React.lazy) бөгөөд хуудас ачаалагдсаны
 * ДАРАА л татагдана (LCP-д нөлөөлөхгүй); `prefers-reduced-motion` бол огт гарахгүй; 15 секундын
 * дараа бүдгэрч алга болно (байнгын хөдөлгөөн уншихад саад, батарей иддэг).
 */
const DURATION_MS = 15_000;
const COUNT = 26;

const CSS = `
.holiday-fx{position:fixed;inset:0;z-index:70;overflow:hidden;pointer-events:none;transition:opacity 1.2s ease}
.holiday-fx.is-done{opacity:0}
.holiday-fx i{position:absolute;top:-6%;left:var(--x);display:block;animation:holiday-fall var(--d) linear var(--delay) infinite;will-change:transform}
.holiday-fx--snow i{width:var(--s);height:var(--s);border-radius:50%;background:#fff;box-shadow:0 0 3px rgba(40,83,122,.45)}
.holiday-fx--petals i{width:calc(var(--s)*1.6);height:var(--s);border-radius:80% 0 80% 0;background:#f3a6bd;opacity:.9}
.holiday-fx--confetti i{width:calc(var(--s)*.7);height:calc(var(--s)*1.4);background:var(--c)}
@keyframes holiday-fall{0%{transform:translate3d(0,0,0) rotate(0)}100%{transform:translate3d(var(--drift),112vh,0) rotate(var(--r))}}
`;

export default function HolidayEffect({ kind }: { kind: EffectKind }) {
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);
  const particles = useMemo(() => Array.from({ length: COUNT }, (_, index) => ({
    x: `${(index * 37) % 100}%`,
    s: `${6 + ((index * 7) % 7)}px`,
    d: `${7 + ((index * 5) % 6)}s`,
    delay: `${-((index * 13) % 70) / 10}s`,
    drift: `${((index % 5) - 2) * 18}px`,
    r: `${(index % 2 ? 1 : -1) * (180 + index * 20)}deg`,
    c: ["var(--primary)", "var(--accent)", "var(--ck-gold)", "var(--sky)"][index % 4],
  })), []);

  useEffect(() => {
    const fade = window.setTimeout(() => setDone(true), DURATION_MS);
    const remove = window.setTimeout(() => setGone(true), DURATION_MS + 1500);
    return () => { window.clearTimeout(fade); window.clearTimeout(remove); };
  }, [kind]);

  if (kind === "none" || gone) return null;
  return (
    <div className={`holiday-fx holiday-fx--${kind}${done ? " is-done" : ""}`} aria-hidden="true" data-holiday-effect={kind}>
      <style>{CSS}</style>
      {particles.map((p, index) => (
        <i key={index} style={{ "--x": p.x, "--s": p.s, "--d": p.d, "--delay": p.delay, "--drift": p.drift, "--r": p.r, "--c": p.c } as React.CSSProperties} />
      ))}
    </div>
  );
}
