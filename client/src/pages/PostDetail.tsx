import { LoaderCircle } from "lucide-react";
import { Link, useRoute } from "wouter";
import CommerceHeader from "@/components/CommerceHeader";
import SiteFooter from "@/components/SiteFooter";
import NotFound from "@/pages/NotFound";
import { trpc } from "@/lib/trpc";
import { useDocumentMeta } from "@/lib/useDocumentMeta";

const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return "";
  return new Intl.DateTimeFormat("mn-MN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
};

export default function PostDetail() {
  const [, params] = useRoute("/:slug");
  const postQuery = trpc.content.bySlug.useQuery({ slug: params?.slug ?? "" }, { enabled: Boolean(params?.slug) });
  const post = postQuery.data;
  // Called unconditionally, before any early return below (Rules of Hooks) --
  // falls back to the post's own title/excerpt when no explicit SEO fields
  // were set in the admin editor, so a post always has SOMETHING reasonable
  // in the browser tab/search-result snippet, never a blank meta tag.
  // 2026-09-27: admin-ий гараар бичсэн metaTitle-ийг ЯГ ХЭВЭЭР нь (бүрэн SEO
  // гарчиг гэж үзнэ); гэвч post.title рүү унавал бусад хуудсын адил сайтын
  // нэрийг залгана -- өмнө нь энэ хуудас цорын ганц site suffix-гүй байсан.
  useDocumentMeta(post?.metaTitle || (post?.title ? `${post.title} — SUGI ASAYAKE` : undefined), post?.metaDescription || post?.excerpt);

  if (postQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]">
        <CommerceHeader backLabel="SUGI ASAYAKE" />
        <main className="mx-auto grid min-h-[60vh] max-w-3xl place-items-center px-4 sm:px-8">
          <LoaderCircle className="animate-spin text-[#df1f3d]" size={28} aria-label="Мэдээг ачаалж байна" />
        </main>
        <SiteFooter />
      </div>
    );
  }

  // 2026-09-21: an unknown single-word path (a typo like /shopp) lands here via
  // the /:slug catch-all -- show the site's real 404 page, not a post-specific
  // "Мэдээ олдсонгүй". The server answers these with HTTP 404 (routeStatus.ts).
  if (postQuery.isError || !post) return <NotFound />;

  return (
    <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]">
      <CommerceHeader backLabel="SUGI ASAYAKE" />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
        <p className="flex items-center gap-3 text-[10px] font-extrabold tracking-[.18em] text-[#c81b34]">
          <span className="h-px w-10 bg-[#df1f3d]" />
          МЭДЭЭ {post.publishedAt ? `· ${formatDate(post.publishedAt)}` : ""}
        </p>
        <h1 className="mt-4 font-[var(--font-display)] text-4xl font-semibold tracking-[-.07em] sm:text-5xl">{post.title}</h1>
        {post.categories.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {post.categories.map(category => <span key={category.id} className="rounded-full bg-[#eef3f1] px-3 py-1 text-[11px] font-bold text-[#3970a7]">{category.name}</span>)}
          </div>
        )}
        {post.excerpt && <p className="mt-5 text-base leading-7 text-[#66676b]">{post.excerpt}</p>}

        {post.coverImageUrl && (
          <div className="mt-8 aspect-[16/9] overflow-hidden rounded-3xl bg-[#e9f0f2]">
            <img src={post.coverImageUrl} alt={post.title} className="h-full w-full object-cover" />
          </div>
        )}

        {/* Content is sanitized server-side at write time (see
            server/_core/sanitizeHtml.ts) -- that's the real trust boundary,
            since TinyMCE's own Text tab lets a staffer type raw HTML. This
            is the one place that stored, already-sanitized HTML is
            rendered, so it's trusted here rather than re-sanitized on every
            page view. `prose` (already installed: @tailwindcss/typography)
            gives real heading/list/link/blockquote styling for free. */}
        <article
          className="prose prose-neutral mt-10 max-w-none text-[15px] leading-7 text-[#3a3b3e]"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {post.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2 border-t border-black/8 pt-6">
            {post.tags.map(tag => <span key={tag.id} className="rounded-full border border-black/10 px-3 py-1 text-[11px] font-bold text-[#77787d]">#{tag.name}</span>)}
          </div>
        )}

        <Link href="/" className="mt-12 inline-flex text-xs font-bold text-[#df1f3d] hover:underline">
          ← Нүүр хуудас руу буцах
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
