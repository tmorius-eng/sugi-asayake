import { useState } from "react";
import { ArrowUpRight, ChevronDown, LayoutGrid, Search } from "lucide-react";
import { Link } from "wouter";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import SiteFooter from "@/components/SiteFooter";
import JobApplicationModal, { type ApplyTarget } from "@/components/JobApplicationModal";
import { footerLogoUrl } from "@/components/site-footer-data";
import { trpc } from "@/lib/trpc";
import { useLocale, useT } from "@/hooks/useLocale";
import { useShopContact } from "@/hooks/useShopContact";
import { getSiteDocumentFallbackFor } from "@shared/site-documents";

/**
 * /careers — нээлттэй ажлын байр (2026-09-14, Tom-ийн лавлагаа дизайнаар).
 *
 * Зохион байгуулалт нь лавлагаа зургийг яг дагана: цайвар шар дэвсгэр дээр
 * хөвж буй том цагаан дугуй булантай карт; картын дээд мөрөнд лого, цэс, дугуй
 * товч; доор нь хоёр багана — зүүн талд асар том гарчиг ("Нээлттэй / ажлын
 * байр"), "ЭСВЭЛ ХОЛБОГДООРОЙ" шошго, доогуур зураастай имэйл, хамгийн доор
 * гурван жижиг холбоос; баруун талд hairline-аар тусгаарлагдсан зарын мөрүүд
 * (цэнхэр eyebrow, том гарчиг, саарал мета мөр, дугуй сум, өнгөт "Өргөдөл
 * илгээх" pill), доор нь chip гарчигтай тайлбарын хоёр багана.
 *
 * Өгөгдөл: зар бүр `job_postings` хүснэгтээс (/admin → Баримт бичиг), бичвэр
 * нь site_documents-ийн "careers" мөр гурван хэлээр, холбоо барих мэдээлэл
 * store settings-ээс — hardcode текст алга. Зар байхгүй бол жагсаалтын оронд
 * нэг мөр гарна; хуудас хоосон харагдахгүй.
 */
export default function Careers() {
  const t = useT();
  const locale = useLocale();
  const contact = useShopContact();
  const [openId, setOpenId] = useState<number | null>(null);
  const [applyFor, setApplyFor] = useState<ApplyTarget | null>(null);

  const fallback = getSiteDocumentFallbackFor("careers", locale);
  const documentsQuery = trpc.content.siteDocuments.useQuery();
  const saved = documentsQuery.data?.find(row => row.documentKey === "careers" && row.locale === locale);
  const title = saved?.title || fallback.title;

  const postingsQuery = trpc.content.jobPostings.useQuery();
  const postings = postingsQuery.data ?? [];

  useDocumentMeta(`${title} — SUGI ASAYAKE`, null);


  return (
    <div className="careers-page">
      <div className="careers-card">
        <header className="careers-nav">
          <Link href="/" className="careers-nav-logo" aria-label="SUGI ASAYAKE"><img src={footerLogoUrl} alt="SUGI ASAYAKE" /></Link>
          <nav className="careers-nav-links" aria-label={t("Цэс")}>
            <Link href="/">{t("Нүүр хуудас")}</Link>
            <Link href="/shop">{t("Дэлгүүр")}</Link>
            <Link href="/brands">{t("Брэндүүд")}</Link>
            <Link href="/about">{t("Бидний тухай")}</Link>
            <Link href="/help">{t("Холбоо барих")}</Link>
          </nav>
          <Link href="/shop" className="careers-nav-cta" aria-label={t("Дэлгүүр")}><LayoutGrid size={18} /></Link>
        </header>

        <div className="careers-grid">
          <aside className="careers-side">
            <div>
              <h1>{t("Нээлттэй ажлын байр")}</h1>
              <p className="careers-side-label">{t("Эсвэл шууд холбогдоорой")}</p>
              <a className="careers-side-email" href={`mailto:${contact.email}`}>{contact.email}</a>
              <button type="button" className="careers-side-apply" onClick={() => setApplyFor({ id: null, title: t("Ерөнхий анкет") })}>{t("Анкетаа илгээх")}</button>
            </div>
            <nav className="careers-side-links" aria-label={t("Холбоосууд")}>
              <Link href="/shop?focus=search"><Search size={13} aria-hidden="true" />{t("Хайх")}</Link>
              <Link href="/shop">{t("Бүтээгдэхүүн")}</Link>
              <Link href="/about">{t("Компани")}</Link>
            </nav>
          </aside>

          <section className="careers-roles" aria-label={title}>
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
                    <div className="careers-role-main">
                      <p className="careers-role-eyebrow">{t("Нээлттэй ажлын байр")}</p>
                      <h2>{posting.title}</h2>
                      {meta.length > 0 && (
                        <p className="careers-role-meta">
                          {meta.map((item, index) => <span key={item}>{index > 0 && <i aria-hidden="true" />}{item}</span>)}
                        </p>
                      )}
                      {posting.description && isOpen && <p className="careers-role-body">{posting.description}</p>}
                    </div>
                    <div className="careers-role-actions">
                      <button
                        type="button"
                        className="careers-role-toggle"
                        aria-expanded={isOpen}
                        aria-label={`${posting.title} — ${t("дэлгэрэнгүй")}`}
                        disabled={!posting.description}
                        onClick={() => setOpenId(isOpen ? null : posting.id)}
                      ><ChevronDown size={18} className={isOpen ? "is-open" : undefined} /></button>
                      {posting.applyUrl
                        ? <a className="careers-role-apply" href={posting.applyUrl} target="_blank" rel="noopener noreferrer">{t("Өргөдөл илгээх")}<ArrowUpRight size={16} aria-hidden="true" /></a>
                        : <button type="button" className="careers-role-apply" onClick={() => setApplyFor({ id: posting.id, title: posting.title })}>{t("Өргөдөл илгээх")}<ArrowUpRight size={16} aria-hidden="true" /></button>}
                    </div>
                  </article>
                );
              })
            )}

            {saved?.contentHtml
              ? <div className="careers-notes doc-body" lang={locale} dangerouslySetInnerHTML={{ __html: saved.contentHtml }} />
              : (
                <div className="careers-notes">
                  {fallback.sections.map(([heading, body]) => (
                    <div key={heading} className="careers-note">
                      <span className="careers-note-chip">{heading}</span>
                      <p>{body}</p>
                    </div>
                  ))}
                </div>
              )}
          </section>
        </div>
      </div>
      <JobApplicationModal target={applyFor} onClose={() => setApplyFor(null)} />
      <SiteFooter />
    </div>
  );
}
