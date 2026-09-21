import { createLucideIcon } from "lucide-react";

/**
 * Brand logos that lucide-react 1.x removed (brand marks are out of lucide's
 * scope since 1.0). Same drawings as lucide 0.453 used, built with lucide's own
 * factory so `size`, `strokeWidth`, `className` and the `lucide lucide-*`
 * classes behave exactly as before — upgrading changed nothing on screen
 * (2026-09-21).
 */
export const Facebook = createLucideIcon("Facebook", [
  ["path", { d: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z", key: "1jg4f8" }],
]);

export const Instagram = createLucideIcon("Instagram", [
  ["rect", { width: "20", height: "20", x: "2", y: "2", rx: "5", ry: "5", key: "2e1cvw" }],
  ["path", { d: "M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z", key: "9exkf1" }],
  ["line", { x1: "17.5", x2: "17.51", y1: "6.5", y2: "6.5", key: "r4j83e" }],
]);

export const Youtube = createLucideIcon("Youtube", [
  ["path", { d: "M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17", key: "1q2vi4" }],
  ["path", { d: "m10 15 5-3-5-3z", key: "1jp15x" }],
]);
