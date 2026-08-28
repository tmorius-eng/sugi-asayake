import { Link } from "wouter";
import { ArrowUpRight, ChevronRight, Newspaper } from "lucide-react";
import SectionEyebrow from "./SectionEyebrow";
import SectionHeading from "./SectionHeading";

export type HomePost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | Date | null;
};

const TONE_CLASS = ["jn-card--tone-0", "jn-card--tone-1", "jn-card--tone-2"];

/**
 * Tier 5 of the home redesign: restyles the (already dark, already
 * real-data-backed) Journal rail from a uniform 3-column grid into a
 * staggered, mixed-tone layout. Preserves exactly what the old inline
 * markup did: trpc.content.latestPosts data, .slice(0, 3) upstream in
 * Home.tsx, the "hide the whole section until a post exists" rule (same
 * discipline as the bestseller rail), and optional coverImageUrl (no
 * fabricated fallback image).
 *
 * Designed for the 3 real count cases (1, 2, or 3 posts -- never more,
 * because of the upstream slice) rather than assuming there are always 3.
 */
export default function JournalSection({ posts }: { posts: HomePost[] }) {
  if (posts.length === 0) return null;

  return (
    <section className="jn-section page-section" data-reveal>
      <SectionEyebrow number="05" label={<><Newspaper size={13} /> SUGI JOURNAL</>} tone="onDark" />
      <div className="jn-heading">
        <SectionHeading tone="onDark">Зөвлөгөө ба <em>мэдээ.</em></SectionHeading>
        <Link href="/shop" className="quiet-link jn-all-link">Бүх нийтлэл <ChevronRight size={16} /></Link>
      </div>
      <div className="jn-grid" data-count={posts.length}>
        {posts.map((post, index) => (
          <Link href={`/${post.slug}`} className={`jn-card ${TONE_CLASS[index % TONE_CLASS.length]}`} key={post.id}>
            {post.coverImageUrl && <img src={post.coverImageUrl} alt="" />}
            <div>
              <span className="jn-card-date">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("mn-MN") : ""}</span>
              <h3>{post.title}</h3>
              {post.excerpt && <p>{post.excerpt}</p>}
              <em>Дэлгэрэнгүй унших <ArrowUpRight size={14} /></em>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
