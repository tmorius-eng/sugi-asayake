import { Link } from "wouter";
import { ArrowUpRight, ChevronRight, Newspaper } from "lucide-react";
import { useSiteText } from "@/hooks/useSiteText";
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

const TONE_CLASS = ["jn-card--tone-0", "jn-card--tone-1"];

/**
 * 2026-09-06: rebuilt from the Tier-5 "staggered mixed-tone grid" version
 * (equal-ish 3-column layout) into a proper editorial hero-plus-stack
 * layout -- researched against the actual pattern NYT/Medium/Substack/The
 * Verge use for exactly this "3 latest posts" shape (one large featured
 * story, smaller supporting cards beside it), rather than 3 same-weight
 * cards. Real content discipline unchanged from the version this replaces:
 * trpc.content.latestPosts data, .slice(0, 3) upstream in Home.tsx, "hide
 * the whole section until a post exists", optional coverImageUrl (no
 * fabricated fallback image), works for exactly 1/2/3 real posts.
 */
export default function JournalSection({ posts }: { posts: HomePost[] }) {
  const textFor = useSiteText();
  if (posts.length === 0) return null;

  const [headingLine1, headingLine2] = textFor("home-text-jn-heading", "Зөвлөгөө ба\nмэдээ.").split("\n");
  const readMoreLabel = textFor("home-text-jn-read-more", "Дэлгэрэнгүй унших");

  return (
    <section className="jn-section page-section" data-reveal>
      <SectionEyebrow number={textFor("home-text-jn-number", "05")} label={<><Newspaper size={13} /> {textFor("home-text-jn-eyebrow-label", "SUGI JOURNAL")}</>} tone="onDark" />
      <div className="jn-heading">
        <SectionHeading tone="onDark">{headingLine1} <em>{headingLine2}</em></SectionHeading>
        <Link href="/journal" className="quiet-link jn-all-link">{textFor("home-text-jn-all-link", "Бүх нийтлэл")} <ChevronRight size={16} /></Link>
      </div>
      <div className="jn-grid" data-count={posts.length}>
        {posts.map((post, index) => {
          const isFeatured = index === 0;
          const dateLabel = post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("mn-MN", { year: "numeric", month: "long", day: "numeric" }) : "";
          return (
            <Link
              href={`/${post.slug}`}
              className={isFeatured ? "jn-card jn-card--featured" : `jn-card ${TONE_CLASS[(index - 1) % TONE_CLASS.length]}`}
              key={post.id}
            >
              {post.coverImageUrl && <img src={post.coverImageUrl} alt="" />}
              {isFeatured && <span className="jn-card-scrim" aria-hidden="true" />}
              <div className="jn-card-body">
                <span className="jn-card-date">{dateLabel}</span>
                <h3>{post.title}</h3>
                {post.excerpt && <p>{post.excerpt}</p>}
                <em>{readMoreLabel} <ArrowUpRight size={14} /></em>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
