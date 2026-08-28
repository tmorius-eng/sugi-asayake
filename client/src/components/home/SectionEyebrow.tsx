import type { ReactNode } from "react";

/**
 * The "01 THE SUGI DIFFERENCE" style numbered kicker bar used at the top of
 * every homepage section. Renders the exact markup shape the existing
 * `.section-heading` / `.section-heading-light` CSS (client/src/index.css)
 * already styles -- no new CSS needed, this just stops 5+ call sites from
 * hand-typing the same two <span> structure.
 *
 * tone="onDark" adds `.section-heading-light` for use on a dark-canvas
 * section (e.g. Why Choose Us, Journal) where the label text needs to read
 * against a dark background instead of the default warm-paper background.
 */
export default function SectionEyebrow({
  number,
  label,
  tone = "default",
}: {
  number: string;
  label: ReactNode;
  tone?: "default" | "onDark";
}) {
  const className = tone === "onDark" ? "section-heading section-heading-light" : "section-heading";
  return (
    <div className={className}>
      <span>{number}</span>
      <span>{label}</span>
    </div>
  );
}
