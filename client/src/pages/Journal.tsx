import { ArrowUpRight, LoaderCircle, Newspaper } from "lucide-react";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { Link, useLocation, useSearch } from "wouter";
import CommerceHeader from "@/components/CommerceHeader";
import SiteFooter from "@/components/SiteFooter";
import { trpc } from "@/lib/trpc";
import { useSiteText } from "@/hooks/useSiteText";

// Two lines; the second is the emphasised half. Kept as a constant so the
// escape lives in exactly one place.
const JOURNAL_HEADING_FALLBACK = "Зөвлөгөө ба\nмэдээ.";

const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return "";
  return new Intl.DateTimeFormat("mn-MN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
};

/**
 * "Бүх нийтлэл" archive page -- the link JournalSection.tsx's homepage
 * teaser points to used to go to /shop (a leftover placeholder). Reuses
 * content.allPosts (same underlying getPublishedPosts() query as the
 * homepage teaser's content.latestPosts, just not sliced to 3) and the
 * same CommerceHeader/warm-paper page shell + Tailwind convention as
 * PostDetail.tsx/Shop.tsx -- this is a standalone page, not a Home.tsx
 * section, so it doesn't use the hand-written .jn-card CSS that section
 * uses. Cover images use object-cover on a fixed aspect ratio (same
 * treatment PostDetail.tsx already uses for a post's own cover), a
 * uniform archive grid rather than Home's staggered teaser layout --
 * appropriate for browsing many articles vs. showcasing 1-3.
 */
export default function Journal() {
  const textFor = useSiteText();
  useDocumentMeta(textFor("seo-text-journal-title", "Зөвлөгөө ба мэдээ — SUGI ASAYAKE"), null);
  const [journalLine1, journalLine2] = textFor("journal-text-heading", JOURNAL_HEADING_FALLBACK).split("\n");
  // Хуудаслалт (2026-09-21): хуудас URL-д (`?page=2`) — refresh/буцахад хадгалагдана
  // (/shop-ийн дүрэмтэй ижил). 12 нийтлэл = 3 багана × 4 мөр.
  const search = useSearch();
  const [, setLocation] = useLocation();
  const page = Math.max(1, Number(new URLSearchParams(search).get("page")) || 1);
  const postsQuery = trpc.content.allPosts.useQuery({ page, pageSize: 12 });
  // Сервер хязгаараас хэтэрсэн хуудсыг хавчдаг — бодит хуудсыг түүнээс авна.
  const currentPage = postsQuery.data?.page ?? page;
  const posts = postsQuery.data?.items ?? [];
  const pageCount = postsQuery.data?.pageCount ?? 1;
  const goTo = (next: number) => setLocation(next <= 1 ? "/journal" : `/journal?page=${next}`);

  return (
    <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]">
      <CommerceHeader backLabel="SUGI ASAYAKE" />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
        <p className="flex items-center gap-3 text-[10px] font-extrabold tracking-[.18em] text-[#c81b34]">
          <span className="h-px w-10 bg-[#df1f3d]" />
          <Newspaper size={13} /> SUGI JOURNAL
        </p>
        <h1 className="mt-4 font-[var(--font-display)] text-4xl font-semibold tracking-[-.07em] sm:text-5xl">
          {journalLine1} <em className="text-[#df1f3d] not-italic">{journalLine2}</em>
        </h1>
        <p className="mt-5 max-w-lg text-[15px] leading-7 text-[#66676b]">
          {textFor("journal-text-lede", "SUGI ASAYAKE-ийн арчилгаа, гоо сайхан, өдөр тутмын зөвлөгөөнүүд.")}
        </p>

        {postsQuery.isLoading && (
          <div className="mt-16 grid place-items-center py-16">
            <LoaderCircle className="animate-spin text-[#df1f3d]" size={28} aria-label="Нийтлэлүүдийг ачаалж байна" />
          </div>
        )}

        {!postsQuery.isLoading && posts.length === 0 && (
          <div className="mt-12 rounded-[2rem] border border-black/8 bg-white p-10 text-center shadow-[0_18px_55px_rgba(44,39,32,.08)]">
            <p className="text-sm text-[#67686c]">Одоогоор нийтлэл алга.</p>
          </div>
        )}

        {posts.length > 0 && (
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map(post => (
              <Link
                key={post.id}
                href={`/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-3xl border border-black/8 bg-white transition hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(44,39,32,.12)]"
              >
                <div className="aspect-[4/3] overflow-hidden bg-[#f1ede6]">
                  {post.coverImageUrl && (
                    <img src={post.coverImageUrl} alt={post.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                  )}
                </div>
                <div className="flex flex-1 flex-col p-6">
                  {post.categories.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      {post.categories.map(category => <span key={category.id} className="rounded-full bg-[#eef3f1] px-2 py-0.5 text-[10px] font-bold text-[#3970a7]">{category.name}</span>)}
                    </div>
                  )}
                  {post.publishedAt && <span className="text-[10px] font-extrabold tracking-[.12em] text-[#c81b34]">{formatDate(post.publishedAt)}</span>}
                  <h3 className="mt-2 font-[var(--font-display)] text-lg font-semibold tracking-[-.03em]">{post.title}</h3>
                  {post.excerpt && <p className="mt-2 line-clamp-2 flex-1 text-[13px] leading-6 text-[#74757a]">{post.excerpt}</p>}
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#17181b] group-hover:text-[#df1f3d]">
                    Дэлгэрэнгүй унших <ArrowUpRight size={13} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <nav className="mt-12 flex items-center justify-center gap-3" aria-label="Нийтлэлийн хуудас">
            {/* 2026-09-23: `?page=40` гэх мэт хязгаараас хэтэрсэн утгыг сервер
                сүүлийн хуудас руу хавчдаг тул ХАРАГДАХ тоог серверийн буцаасан
                хуудсаар авна. Өмнө нь "40 / 3" гэж бичигдээд "Өмнөх" нь 39 руу
                (дахин сүүлийн хуудас руу) очдог байв. */}
            <button type="button" className="journal-page-btn" disabled={currentPage <= 1} onClick={() => goTo(currentPage - 1)}>← Өмнөх</button>
            <span className="text-sm text-[#67686c]">{`${currentPage} / ${pageCount}`}</span>
            <button type="button" className="journal-page-btn" disabled={currentPage >= pageCount} onClick={() => goTo(currentPage + 1)}>Дараах →</button>
          </nav>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
