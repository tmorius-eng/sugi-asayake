import type { ReactNode } from "react";

/**
 * Large editorial <h2> used by the new home-redesign sections. Uses a
 * dedicated `.editorial-heading` class (client/src/index.css) rather than
 * joining the legacy `.story-grid h2, .collection-heading h2, ...` shared
 * selector list, so new sections don't keep growing that list -- it stays
 * scoped to the sections that predate this redesign.
 *
 * Wrap the accent phrase in <em> yourself when calling this, same
 * convention the existing headings already use, e.g.:
 *   <SectionHeading>Японы чанарыг<br /><em>ойртуулна.</em></SectionHeading>
 *
 * tone="onDark" is for dark-canvas sections (Journal; Why Choose Us was
 * one until its 2026-09-12 light rebuild) --
 * flips the base text to ivory and the <em> accent to gold instead of
 * vermilion, matching .final-cta h2's existing dark-section treatment.
 */
export default function SectionHeading({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "onDark";
  className?: string;
}) {
  const classes = ["editorial-heading", tone === "onDark" ? "editorial-heading--inverse" : "", className]
    .filter(Boolean)
    .join(" ");
  return <h2 className={classes}>{children}</h2>;
}
