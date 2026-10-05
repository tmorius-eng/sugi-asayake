import { useState } from "react";
import { Heart, LoaderCircle, MessageCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import ImageLightbox from "@/components/ImageLightbox";
import { gridVariantUrl } from "@shared/image-variants";
import { useAuth } from "@/_core/hooks/useAuth";
import { brandName } from "@/lib/brand";

/**
 * Threaded review conversation (2026-09-13) -- the layout Tom pointed at
 * (ishadeed.com's comment component): avatar on the left, a soft bubble
 * with the text, a "Like · Reply · time" row beneath, and replies indented
 * under the review with a connector line that runs from the parent avatar
 * down and curves into each reply. The connector is CSS only
 * (border-inline-start + border-end-start-radius, in logical properties so
 * it mirrors correctly if the site is ever read right-to-left) and the
 * colours are the storefront tokens, so it follows the Linen light theme
 * and the dark theme without a second stylesheet. See .review-thread-* in
 * index.css.
 *
 * Data comes from reviews.list (one query, replies and likes included) and
 * every action here -- like, reply -- is a real mutation that is stored in
 * Aiven and re-read; nothing is optimistic-only.
 */

type Reply = {
  id: number;
  body: string;
  createdAt: Date | string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  authorIsStaff: boolean;
  authorUserId: number;
};

export type ThreadReview = {
  id: number;
  rating: number;
  comment: string | null;
  /** 0093: худалдан авагчийн нэг зураг (эсвэл null). */
  imageUrl?: string | null;
  createdAt: Date | string;
  reviewerName: string | null;
  reviewerAvatarUrl: string | null;
  reviewerIsStaff: boolean;
  reviewerUserId: number;
  likeCount: number;
  likedByMe: boolean;
  replies: Reply[];
};

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Алдаа гарлаа.";

/** "4д", "2ц", "5мин" -- short relative time like the reference; the exact
 *  timestamp stays in the title attribute. */
export function relativeTime(value: Date | string, now = Date.now()): string {
  const then = new Date(value).getTime();
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "саяхан";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}мин`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}ц`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}ө`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}сар`;
  return `${Math.round(months / 12)}ж`;
}

function initials(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, 2).map(word => word[0]!.toUpperCase()).join("");
}

function Avatar({ name, url, size = 40 }: { name: string | null; url: string | null; size?: number }) {
  return url
    ? <img src={url} alt="" width={size} height={size} className="review-avatar" loading="lazy" />
    : <span className="review-avatar review-avatar--initials" style={{ width: size, height: size }} aria-hidden="true">{initials(name)}</span>;
}

function Stars({ value }: { value: number }) {
  return <span className="review-stars" aria-label={`${value} од`}>{[1, 2, 3, 4, 5].map(n => <Star key={n} size={13} fill={n <= value ? "var(--accent)" : "none"} stroke={n <= value ? "var(--accent)" : "currentColor"} strokeOpacity={n <= value ? 1 : 0.35} />)}</span>;
}

function StaffBadge() {
  return <span className="review-staff-badge">{brandName()}</span>;
}

export default function ReviewThread({ productId, reviews, canReply }: { productId: number; reviews: ThreadReview[]; canReply: boolean }) {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);

  const like = trpc.reviews.like.useMutation({
    onSuccess: () => utils.reviews.list.invalidate({ productId }),
    onError: error => toast.error(messageFrom(error)),
  });
  const reply = trpc.reviews.reply.useMutation({
    onSuccess: () => {
      toast.success("Хариулт нийтлэгдлээ.");
      setDraft("");
      setReplyingTo(null);
      utils.reviews.list.invalidate({ productId });
    },
    onError: error => toast.error(messageFrom(error)),
  });

  const requireLogin = () => toast.error("Нэвтэрсний дараа боломжтой.");

  return (
    <>
    <ol className="review-thread" aria-label="Сэтгэгдлүүд">
      {reviews.map(review => {
        const hasReplies = review.replies.length > 0;
        const open = replyingTo === review.id;
        // 2026-09-27: like товч pending үед идэвхтэй хэвээр байсан тул давхар
        // товшилт хоёр дахь mutate дуудалт явуулж, сервер тоглож (toggle)
        // байгаа тул тоо/төлөв буруу гарах эрсдэлтэй байв.
        const likePending = like.isPending && like.variables?.reviewId === review.id;
        return (
          <li key={review.id} className={`review-item${hasReplies || open ? " review-item--has-replies" : ""}`}>
            <div className="review-row">
              <Avatar name={review.reviewerName} url={review.reviewerAvatarUrl} />
              <div className="review-main">
                <div className="review-bubble">
                  <div className="review-bubble-head">
                    {/* translate="no" (2026-09-27): худалдан авагчийн нэр,
                        сэтгэгдлийн эх бичвэр -- TranslateSurface-ийн дурын
                        хэл рүү будлиулбал үг зохисгүй орчуулагдах эрсдэлтэй. */}
                    <strong className="review-author" translate="no">{review.reviewerName || "Худалдан авагч"}</strong>
                    {review.reviewerIsStaff && <StaffBadge />}
                    <Stars value={review.rating} />
                  </div>
                  {review.comment ? <p className="review-text" translate="no">{review.comment}</p> : <p className="review-text review-text--muted">Үнэлгээ өгсөн, сэтгэгдэл бичээгүй.</p>}
                  {review.imageUrl ? (
                    <button type="button" className="review-photo" onClick={() => setPhoto(review.imageUrl ?? null)} aria-label={`${review.reviewerName || "Худалдан авагч"}-ийн зургийг томоор харах`}>
                      <img src={gridVariantUrl(review.imageUrl) ?? review.imageUrl} alt="" loading="lazy" />
                    </button>
                  ) : null}
                </div>
                <div className="review-actions">
                  <button
                    type="button"
                    disabled={likePending}
                    className={`review-action${review.likedByMe ? " is-active" : ""}`}
                    onClick={() => (isAuthenticated ? like.mutate({ reviewId: review.id }) : requireLogin())}
                    /* 2026-09-23: `aria-label` хассан. Харагдах текст нь
                       "Таалагдлаа · 3" атлаа тэмдэглэсэн үед хүртээмжийн нэр
                       нь "Таалагдсанаа болих" болж, харагдах нэрээ АГУУЛАХАА
                       больдог байв (WCAG 2.5.3, PROJECT-GUIDE-ийн дүрэм).
                       Төлөвийг `aria-pressed` аль хэдийн зөв дамжуулна;
                       тоон badge нь `aria-hidden`. */
                    aria-pressed={review.likedByMe}
                  >
                    <Heart size={14} fill={review.likedByMe ? "currentColor" : "none"} aria-hidden="true" />
                    Таалагдлаа{review.likeCount > 0 ? <span aria-hidden="true">{` · ${review.likeCount}`}</span> : null}
                  </button>
                  {canReply && (
                    <button type="button" className={`review-action${open ? " is-active" : ""}`} onClick={() => { setReplyingTo(open ? null : review.id); setDraft(""); }}>
                      <MessageCircle size={14} aria-hidden="true" />
                      Хариулах
                    </button>
                  )}
                  <time className="review-time" dateTime={new Date(review.createdAt).toISOString()} title={new Date(review.createdAt).toLocaleString("mn-MN")}>{relativeTime(review.createdAt)}</time>
                </div>
              </div>
            </div>

            {(hasReplies || open) && (
              <ol className="review-replies">
                {review.replies.map(item => (
                  <li key={item.id} className="review-reply">
                    <div className="review-row">
                      <Avatar name={item.authorName} url={item.authorAvatarUrl} size={32} />
                      <div className="review-main">
                        <div className="review-bubble">
                          <div className="review-bubble-head">
                            <strong className="review-author" translate="no">{item.authorName || "Хэрэглэгч"}</strong>
                            {item.authorIsStaff && <StaffBadge />}
                          </div>
                          <p className="review-text" translate="no">{item.body}</p>
                        </div>
                        <div className="review-actions">
                          <time className="review-time" dateTime={new Date(item.createdAt).toISOString()} title={new Date(item.createdAt).toLocaleString("mn-MN")}>{relativeTime(item.createdAt)}</time>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {open && (
                  <li className="review-reply">
                    <form
                      className="review-row"
                      onSubmit={event => {
                        event.preventDefault();
                        if (!draft.trim()) return;
                        reply.mutate({ reviewId: review.id, body: draft.trim() });
                      }}
                    >
                      <span className="review-avatar review-avatar--initials" style={{ width: 32, height: 32 }} aria-hidden="true">Та</span>
                      <div className="review-main">
                        <textarea
                          translate="no"
                          value={draft}
                          onChange={event => setDraft(event.target.value)}
                          maxLength={2000}
                          rows={2}
                          autoFocus
                          placeholder="Хариулт бичих…"
                          className="review-reply-input"
                          aria-label="Хариулт"
                        />
                        <div className="review-actions">
                          <button type="submit" className="review-action review-action--primary" disabled={reply.isPending || !draft.trim()}>
                            {reply.isPending ? <LoaderCircle className="animate-spin" size={14} aria-hidden="true" /> : null}
                            Илгээх
                          </button>
                          <button type="button" className="review-action" onClick={() => { setReplyingTo(null); setDraft(""); }}>Болих</button>
                        </div>
                      </div>
                    </form>
                  </li>
                )}
              </ol>
            )}
          </li>
        );
      })}
    </ol>
    <ImageLightbox images={photo ? [photo] : []} index={0} onIndexChange={() => undefined} open={photo !== null} onOpenChange={open => { if (!open) setPhoto(null); }} alt="Худалдан авагчийн зураг" />
    </>
  );
}
