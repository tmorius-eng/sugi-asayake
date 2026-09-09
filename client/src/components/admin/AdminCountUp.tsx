import { useEffect, useRef, useState } from "react";

/**
 * Counts a metric up from zero on mount / whenever the value changes.
 *
 * The number that lands is always the exact `value` passed in — the animation
 * only affects the intermediate frames, never the final rendered figure. That
 * matters here: every KPI on this dashboard is real revenue/order data, so an
 * eased approximation must never be what an admin ends up reading.
 *
 * `format` receives the interpolated number, so a caller can animate through
 * ₮-formatted or %-suffixed values without this component knowing anything
 * about currency or locale.
 */
export default function AdminCountUp({ value, format, durationMs = 900, className }: {
  value: number;
  format: (value: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || durationMs <= 0) {
      setDisplayValue(value);
      return;
    }

    const from = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // Same cubic ease-out the CSS --ease-out token approximates, so the
      // digits settle on the same rhythm as the card they sit in.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(progress === 1 ? value : from + (value - from) * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, durationMs]);

  return <span className={className}>{format(displayValue)}</span>;
}
