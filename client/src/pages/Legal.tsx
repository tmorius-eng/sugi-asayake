import { ArrowLeft } from "lucide-react";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { Link, useLocation } from "wouter";
import SiteFooter from "@/components/SiteFooter";
import { trpc } from "@/lib/trpc";
import {
  getLegalDocumentFallback,
  legalSectionsToHtml,
  type LegalDocumentKey,
} from "@shared/legal-documents";

/**
 * /privacy, /terms and /returns.
 *
 * 2026-09-12: the three documents used to be a `documents` object literal in
 * this file -- ~14 KB of researched legal prose that only a code deploy
 * could change, even though what it says is a business decision the owner
 * revises (Tom has already revised the returns policy twice). They now live
 * in the `site_documents` table, edited in /admin -> Баримт бичиг with the
 * same TinyMCE editor as the news posts, and the researched text moved
 * verbatim to shared/legal-documents.ts as the fallback.
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
const ROUTE_TO_KEY: Record<string, LegalDocumentKey> = {
  "/privacy": "privacy",
  "/terms": "terms",
  "/returns": "returns",
};

export default function Legal() {
  const [location] = useLocation();
  const key: LegalDocumentKey = ROUTE_TO_KEY[location] ?? "privacy";
  const fallback = getLegalDocumentFallback(key);

  const documentsQuery = trpc.content.siteDocuments.useQuery();
  const saved = documentsQuery.data?.find(row => row.documentKey === key);

  const title = saved?.title || fallback.title;
  const lead = saved?.lead ?? fallback.lead;
  const updatedLabel = saved?.updatedLabel ?? fallback.updated;
  const contentHtml = saved?.contentHtml || legalSectionsToHtml(fallback.sections);

  useDocumentMeta(`${title} — SUGI ASAYAKE`, null);

  return (
    <div className="doc-shell">
      <main className="doc-main">
        <Link href="/" className="doc-back"><ArrowLeft size={15} />Нүүр хуудас руу буцах</Link>
        <div className="doc-head">
          <p className="doc-kicker">SUGI ASAYAKE MONGOLIA</p>
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
          <span className="doc-updated">Сүүлд шинэчилсэн: {updatedLabel}</span>
        </div>
        {/* .doc-body carries the numbered-section styling the old per-section
            markup had; see index.css. One container instead of a mapped list
            because the body is now a single authored HTML document. */}
        <div className="doc-sections doc-body" dangerouslySetInnerHTML={{ __html: contentHtml }} />
      </main>
      <SiteFooter />
    </div>
  );
}
