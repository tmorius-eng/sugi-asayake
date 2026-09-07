// 2026-09-07 (WordPress-parity admin editor rebuild): the new post editor's
// TinyMCE "Text" tab lets a staffer type or paste ARBITRARY raw HTML directly
// (that's the whole point of a source view) -- this is the real trust
// boundary that makes that safe. Runs on every create/update, server-side,
// before a post's `content` ever reaches the database. Client-side rendering
// (client/src/pages/PostDetail.tsx) trusts what's already stored rather than
// re-sanitizing on every render, since this is the one place content is
// written.
//
// `sanitize-html` (not DOMPurify) because it runs in plain Node with no DOM/
// jsdom dependency, which is what a server-side pass needs.
//
// Allowlist is exactly what the configured TinyMCE toolbar (see
// client/src/components/admin/TinyMceEditor.tsx) can actually produce --
// script/style/iframe/on*-event-handler attributes and everything else are
// stripped, not merely escaped, so a submitted <script> tag disappears
// entirely rather than surviving as inert text.
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "s", "u",
  "ul", "ol", "li", "blockquote",
  "a", "img",
  "h2", "h3", "h4",
  "span",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "target", "rel"],
  img: ["src", "alt", "width", "height"],
  span: ["style"],
  p: ["style"],
};

export function sanitizePostContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    // Only the text-alignment styles TinyMCE's align buttons actually emit --
    // an open `style` allowlist would let arbitrary CSS (including
    // `expression()`-style legacy attacks or layout-breaking values) through.
    allowedStyles: {
      p: { "text-align": [/^left$|^right$|^center$|^justify$/] },
      span: { "text-align": [/^left$|^right$|^center$|^justify$/] },
    },
    // Only allow http(s)/mailto/tel links and our own R2-proxied /cdn/ image
    // paths -- blocks javascript: URLs and other schemes outright.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
    // Strip disallowed tags' content only for script/style (their text is
    // never wanted); everything else that's disallowed keeps its inner text
    // so a staffer's words are never silently deleted, just its markup.
    nonTextTags: ["script", "style", "textarea", "option"],
  });
}
