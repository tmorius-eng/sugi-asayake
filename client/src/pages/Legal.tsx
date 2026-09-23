import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { useLocation } from "wouter";
import SiteFooter from "@/components/SiteFooter";
import CommerceHeader from "@/components/CommerceHeader";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/hooks/useLocale";
import {
  getSiteDocumentFallbackFor,
  documentSectionsToHtml,
  siteDocumentFallbacks,
  type SiteDocumentKey,
} from "@shared/site-documents";

/**
 * /privacy, /terms and /returns.
 *
 * 2026-09-12: the three documents used to be a `documents` object literal in
 * this file -- ~14 KB of researched legal prose that only a code deploy
 * could change, even though what it says is a business decision the owner
 * revises (Tom has already revised the returns policy twice). They now live
 * in the `site_documents` table, edited in /admin -> Баримт бичиг with the
 * same TinyMCE editor as the news posts, and the researched text moved
 * verbatim to shared/site-documents.ts as the fallback.
 *
 * 2026-09-14: one document per language. The visitor's language switch
 * (useLocale) picks the row saved for that language, else the code fallback
 * in that language (shared/site-documents.i18n.ts for en/ja). A legal text
 * is authored per language, not run through the word-by-word page
 * translator -- which is also why an English page never shows a
 * half-translated paragraph when the admin has revised only the Mongolian.
 *
 * Precedence is the same contract as every other admin-editable surface
 * here: a saved row wins, no row means the code fallback, and clearing the
 * row in /admin restores exactly the original wording. A shopper therefore
 * never sees an empty legal page -- which matters more here than anywhere
 * else on the site, because these pages carry statutory disclosures.
 *
 * The fallback's [heading, paragraph] pairs are converted to the same <h2>/
 * <p> HTML an admin-saved document stores, so both paths render through one
 * code path and cannot drift apart visually. The HTML is sanitized on the
 * server at write time (server/db.ts's upsertSiteDocument), exactly like
 * posts.content, so rendering it here is the same trust decision
 * PostDetail.tsx already makes.
 */
/**
 * Зам -> баримтын түлхүүр. Гараар бичсэн хоёр дахь жагсаалт БИШ: түлхүүр бүрийн
 * зам нь shared/site-documents.ts дотор тодорхойлогдсон тул шинэ баримт нэмэхэд
 * энэ хүснэгт өөрөө шинэчлэгдэнэ (App.tsx-д <Route> нэмэх нь үлдэнэ).
 */
const ROUTE_TO_KEY: Record<string, SiteDocumentKey> = Object.fromEntries(
  siteDocumentFallbacks.map(document => [document.path, document.key]),
);

export default function Legal() {
  const [location] = useLocation();
  const locale = useLocale();
  // 2026-09-23: төгсгөлийн зураасыг хасна. wouter-ийн `/terms` маршрут нь
  // `/terms/`-ийг МӨН тааруулдаг атлаа энэ хүснэгт яг `/terms`-ээр
  // түлхүүрлэгддэг тул хуваалцсан `…/returns/` холбоос Нууцлалын бодлогыг
  // /returns хаяган дор үзүүлдэг байв.
  const normalisedPath = location.replace(/\/+$/, "") || "/";
  const key: SiteDocumentKey = ROUTE_TO_KEY[normalisedPath] ?? "privacy";
  const fallback = getSiteDocumentFallbackFor(key, locale);

  const documentsQuery = trpc.content.siteDocuments.useQuery();
  const saved = documentsQuery.data?.find(row => row.documentKey === key && row.locale === locale);

  const title = saved?.title || fallback.title;
  const lead = saved?.lead ?? fallback.lead;
  const updatedLabel = saved?.updatedLabel ?? fallback.updated;
  const contentHtml = saved?.contentHtml || documentSectionsToHtml(fallback.sections);

  useDocumentMeta(`${title} — SUGI ASAYAKE`, null);

  return (
    <div className="doc-shell">
      {/* 2026-09-21 (Tom): the legal pages get the site header like every other
          storefront page -- search, language, cart, menu. Its back arrow
          replaces the old in-page "Нүүр хуудас руу буцах" link. */}
      <CommerceHeader backLabel="SUGI ASAYAKE" />
      <main className="doc-main">
        <div className="doc-head">
          <p className="doc-kicker">SUGI ASAYAKE MONGOLIA</p>
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
          <span className="doc-updated">Сүүлд шинэчилсэн: {updatedLabel}</span>
        </div>
        {/* .doc-body carries the numbered-section styling the old per-section
            markup had; see index.css. One container instead of a mapped list
            because the body is now a single authored HTML document. */}
        <div className="doc-sections doc-body" lang={locale} dangerouslySetInnerHTML={{ __html: contentHtml }} />
      </main>
      <SiteFooter />
    </div>
  );
}
