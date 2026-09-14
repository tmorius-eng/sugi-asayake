// 2026-09-07 (WordPress-той ижил admin editor): шинэ нийтлэлийн editor-ийн TinyMCE
// "Text" таб ажилтанд ДУРЫН түүхий HTML бичих/хуулах боломж олгодог (source view-
// ийн бүх утга нь энэ) — үүнийг аюулгүй болгодог бодит итгэлийн хил энд. Create/
// update бүрт, сервер талд, нийтлэлийн `content` DB-д хүрэхээс өмнө ажиллана.
// Client талын render (client/src/pages/PostDetail.tsx) render бүрт дахин sanitize
// хийхийн оронд хадгалагдсанд итгэнэ, учир нь агуулга бичигдэх цорын ганц газар энэ.
//
// `sanitize-html` (DOMPurify биш) — DOM/jsdom dependency-гүй энгийн Node-д ажилладаг,
// сервер талын шүүлтэд яг хэрэгтэй нь.
//
// Allowlist нь тохируулсан TinyMCE toolbar-ийн (client/src/components/admin/
// TinyMceEditor.tsx) бодитоор гаргаж чадах зүйл л — script/style/iframe/on*-event
// attribute ба бусад бүгд escape биш устгагдана, тиймээс илгээсэн <script> tag
// идэвхгүй текст болж үлдэхгүй, бүрмөсөн алга болно.
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
