import { useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronDown, Mail } from "lucide-react";
import { Link } from "wouter";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import SiteFooter from "@/components/SiteFooter";
import { trpc } from "@/lib/trpc";
import { useLocale, useT } from "@/hooks/useLocale";
import { useShopContact } from "@/hooks/useShopContact";
import { getSiteDocumentFallbackFor } from "@shared/site-documents";

/**
 * /careers — нээлттэй ажлын байр (2026-09-14).
 *
 * Хоёр эх сурвалжийг нэг хуудсанд нийлүүлнэ, аль аль нь /admin-аас засагдана:
 *  • ЗАР бүр `job_postings` хүснэгтийн мөр (Баримт бичиг хэсгийн доод талд
 *    нэмж, засаж, нуудаг). Нэг ч нийтлэгдсэн зар байхгүй бол жагсаалтын оронд
 *    "одоогоор нээлттэй ажлын байр байхгүй" гэсэн мөр гарна — хоосон хуудас
 *    хэзээ ч харагдахгүй.
 *  • БИЧВЭР (танилцуулга, хэрхэн өргөдөл гаргах, мэдээллийн нууцлал) нь
 *    site_documents-ийн "careers" мөр, гурван хэлээр; мөр байхгүй хэл дээрээ
 *    shared/site-documents.ts-ийн fallback-аа хэвээр зурна.
 *
 * Зохион байгуулалт нь Tom-ийн өгсөн лавлагаа зурган дээрхтэй ижил: зүүн талд
 * наалдац (sticky) гарчиг + холбоо барих имэйл, баруун талд ажлын байрны мөр
 * бүр (нэр, төрөл/цалин/байршил, дэлгэрэнгүйг нээх сум, өргөдөл илгээх товч).
 * Өнгө, шрифт, hairline хүрээ, 4px радиус нь сайтын өөрийн токенууд — лавлагааны
 * улбар шар биш, манай улаан (`--primary-text`).
 */
export default function Careers() {
  const t = useT();
  const locale = useLocale();
  const contact = useShopContact();
  const [openId, setOpenId] = useState<number | null>(null);

  const fallback = getSiteDocumentFallbackFor("careers", locale);
  const documentsQuery = trpc.content.siteDocuments.useQuery();
  const saved = documentsQuery.data?.find(row => row.documentKey === "careers" && row.locale === locale);
  const title = saved?.title || fallback.title;
  const lead = saved?.lead ?? fallback.lead;

  const postingsQuery = trpc.content.jobPostings.useQuery();
  const postings = postingsQuery.data ?? [];

  useDocumentMeta(`${title} — SUGI ASAYAKE`, null);

  /** Өргөдлийн холбоос: тусгай маягт > зарын имэйл > дэлгүүрийн ерөнхий имэйл. */
  const applyHref = (posting: { title: string; applyEmail: string | null; applyUrl: string | null }) => {
    if (posting.applyUrl) return posting.applyUrl;
    const email = posting.applyEmail || contact.email;
    return `mailto:${email}?subject=${encodeURIComponent(`${t("Ажлын байр")}: ${posting.title}`)}`;
  };

  return (
    <div className="doc-shell">
      <main className="careers-main">
        <Link href="/" className="doc-back"><ArrowLeft size={15} />{t("Нүүр хуудас руу буцах")}</Link>

        <div className="careers-layout">
          <aside className="careers-aside">
            <p className="doc-kicker">SUGI ASAYAKE MONGOLIA</p>
            <h1>{title}</h1>
            {lead && <p className="careers-lead">{lead}</p>}
            <p className="careers-contact-label">{t("Эсвэл шууд холбогдоорой")}</p>
            <a className="careers-contact-link" href={`mailto:${contact.email}`}><Mail size={14} aria-hidden="true" />{contact.email}</a>
            <a className="careers-contact-link" href={`tel:${contact.phoneHref}`}>{contact.phone}</a>
          </aside>

          <section className="careers-list" aria-label={title}>
            {postingsQuery.isLoading ? (
              <p className="careers-empty">{t("Уншиж байна…")}</p>
            ) : postings.length === 0 ? (
              <p className="careers-empty">{t("Одоогоор нээлттэй ажлын байр байхгүй байна. Шинэ зар гармагц энэ хуудсанд байршуулна.")}</p>
            ) : (
              postings.map(posting => {
                const isOpen = openId === posting.id;
                const meta = [posting.employmentType, posting.salaryRange, posting.location].filter(Boolean);
                return (
                  <article key={posting.id} className="careers-role">
                    <p className="careers-role-eyebrow">{t("Нээлттэй ажлын байр")}</p>
                    <div className="careers-role-head">
                      <div className="careers-role-title">
                        <h2>{posting.title}</h2>
                        {meta.length > 0 && (
                          <p className="careers-role-meta">
                            {meta.map((item, index) => (
                              <span key={item}>{index > 0 && <i aria-hidden="true">•</i>}{item}</span>
                            ))}
                          </p>
                        )}
                      </div>
                      <div className="careers-role-actions">
                        {posting.description && (
                          <button
                            type="button"
                            className="careers-role-toggle"
                            aria-expanded={isOpen}
                            aria-label={`${posting.title} — ${t("дэлгэрэнгүй")}`}
                            onClick={() => setOpenId(isOpen ? null : posting.id)}
                          ><ChevronDown size={17} className={isOpen ? "is-open" : undefined} /></button>
                        )}
                        <a
                          className="careers-role-apply"
                          href={applyHref(posting)}
                          {...(posting.applyUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        >{t("Өргөдөл илгээх")}<ArrowUpRight size={15} aria-hidden="true" /></a>
                      </div>
                    </div>
                    {posting.description && isOpen && <p className="careers-role-body">{posting.description}</p>}
                  </article>
                );
              })
            )}

            {/* Хуудасны бичвэр: зар байгаа эсэхээс үл хамааран үргэлж доор нь.
                Админ хадгалсан бол түүний HTML (бичих үед сервер дээр sanitize
                хийгддэг, Legal.tsx-тэй ижил гэрээ), эс бөгөөс кодын fallback. */}
            {saved?.contentHtml
              ? <div className="careers-notes doc-body" lang={locale} dangerouslySetInnerHTML={{ __html: saved.contentHtml }} />
              : (
                <div className="careers-notes">
                  {fallback.sections.map(([heading, body]) => (
                    <div key={heading} className="careers-note">
                      <p className="careers-note-label">{heading}</p>
                      <p>{body}</p>
                    </div>
                  ))}
                </div>
              )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
