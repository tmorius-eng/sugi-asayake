import { useState } from "react";
import { LoaderCircle, MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { relativeTime } from "@/components/ReviewThread";

/**
 * Product Q&A (2026-09-13, growth tier). "Хуурай арьсанд тохирох уу?" asked
 * once on the product page, answered by staff or by a customer who bought
 * it, visible to every later shopper. Reuses the review thread's markup and
 * .review-* styles (ishadeed-style bubbles + connector) so the two sections
 * read as one design. Data: questions.list (answers inlined); actions are
 * real mutations (moderated, strict rate-limited) and the list is re-read.
 */

type Answer = { id: number; body: string; createdAt: Date | string; authorName: string; authorAvatarUrl: string | null; authorIsStaff: boolean; authorUserId: number };
type Question = Answer & { answers: Answer[] };

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Алдаа гарлаа.";

function initials(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, 2).map(word => word[0]!.toUpperCase()).join("") : "?";
}

function Avatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  return url
    ? <img src={url} alt="" width={size} height={size} className="review-avatar" loading="lazy" />
    : <span className="review-avatar review-avatar--initials" style={{ width: size, height: size }} aria-hidden="true">{initials(name)}</span>;
}

const QUESTION_PAGE_SIZE = 20;

export default function ProductQuestions({ productId, canAnswer }: { productId: number; canAnswer: boolean }) {
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  // Хуудаслалт (2026-09-21): reviews-тэй ижил cursor загвар; нийт тоо тусдаа query.
  const list = trpc.questions.list.useInfiniteQuery({ productId, limit: QUESTION_PAGE_SIZE }, {
    getNextPageParam: last => (last.length === QUESTION_PAGE_SIZE ? last[last.length - 1].id : undefined),
  });
  const countQuery = trpc.questions.count.useQuery({ productId });
  const [askOpen, setAskOpen] = useState(false);
  const [askDraft, setAskDraft] = useState("");
  const [answeringId, setAnsweringId] = useState<number | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");

  const ask = trpc.questions.ask.useMutation({
    onSuccess: () => { toast.success("Асуулт нийтлэгдлээ. Ажилтан эсвэл худалдан авагч удахгүй хариулна."); setAskDraft(""); setAskOpen(false); void utils.questions.invalidate(); utils.questions.list.invalidate({ productId }); },
    onError: error => toast.error(messageFrom(error)),
  });
  const answer = trpc.questions.answer.useMutation({
    onSuccess: () => { toast.success("Хариулт нийтлэгдлээ."); setAnswerDraft(""); setAnsweringId(null); void utils.questions.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });

  const questions = (list.data?.pages.flat() ?? []) as Question[];
  const questionTotal = countQuery.data ?? questions.length;
  const requireLogin = () => toast.error("Асуулт асуухын тулд нэвтэрнэ үү.");

  return (
    <section id="product-questions" className="product-questions pdp-anchor-section" aria-labelledby="product-questions-heading">
      <div className="product-questions-head">
        <div>
          <h2 id="product-questions-heading" className="product-questions-title"><MessageCircleQuestion size={20} aria-hidden="true" /> Асуулт, хариулт{questionTotal ? ` · ${questionTotal}` : ""}</h2>
          <p className="product-questions-sub">Энэ барааны талаар асуултаа бичээрэй — ажилтан эсвэл өмнө авсан хэрэглэгч хариулна.</p>
        </div>
        <button type="button" className="review-action review-action--primary" onClick={() => (isAuthenticated ? setAskOpen(open => !open) : requireLogin())}>
          {askOpen ? "Болих" : "Асуулт асуух"}
        </button>
      </div>

      {askOpen && (
        <form
          className="review-row product-questions-ask"
          onSubmit={event => { event.preventDefault(); if (askDraft.trim().length >= 5) ask.mutate({ productId, body: askDraft.trim() }); }}
        >
          <span className="review-avatar review-avatar--initials" style={{ width: 40, height: 40 }} aria-hidden="true">{initials(user?.name ?? null)}</span>
          <div className="review-main">
            <textarea value={askDraft} onChange={event => setAskDraft(event.target.value)} maxLength={1000} rows={3} autoFocus placeholder="Жишээ: Хуурай, мэдрэмтгий арьсанд тохирох уу?" className="review-reply-input" aria-label="Асуулт" />
            <div className="review-actions">
              <button type="submit" className="review-action review-action--primary" disabled={ask.isPending || askDraft.trim().length < 5}>
                {ask.isPending ? <LoaderCircle className="animate-spin" size={14} aria-hidden="true" /> : null} Илгээх
              </button>
              <span className="review-time">{askDraft.trim().length < 5 ? "Дор хаяж 5 тэмдэгт" : `${askDraft.length}/1000`}</span>
            </div>
          </div>
        </form>
      )}

      {list.isLoading ? (
        <p className="review-text review-text--muted">Ачаалж байна…</p>
      ) : questions.length === 0 ? (
        <p className="review-text review-text--muted product-questions-empty">Асуулт хараахан алга. Хамгийн түрүүнд асуугаарай.</p>
      ) : (
        <ol className="review-thread" aria-label="Асуултууд">
          {questions.map(question => {
            const open = answeringId === question.id;
            const hasAnswers = question.answers.length > 0;
            return (
              <li key={question.id} className={`review-item${hasAnswers || open ? " review-item--has-replies" : ""}`}>
                <div className="review-row">
                  <Avatar name={question.authorName} url={question.authorAvatarUrl} />
                  <div className="review-main">
                    <div className="review-bubble">
                      <div className="review-bubble-head">
                        <strong className="review-author">{question.authorName}</strong>
                        <span className="product-question-tag">Асуулт</span>
                      </div>
                      <p className="review-text">{question.body}</p>
                    </div>
                    <div className="review-actions">
                      {canAnswer && (
                        <button type="button" className={`review-action${open ? " is-active" : ""}`} onClick={() => { setAnsweringId(open ? null : question.id); setAnswerDraft(""); }}>
                          <MessageCircleQuestion size={14} aria-hidden="true" /> Хариулах
                        </button>
                      )}
                      {!hasAnswers && !canAnswer && <span className="review-time">Хариулт хүлээгдэж байна</span>}
                      <time className="review-time" dateTime={new Date(question.createdAt).toISOString()} title={new Date(question.createdAt).toLocaleString("mn-MN")}>{relativeTime(question.createdAt)}</time>
                    </div>
                  </div>
                </div>

                {(hasAnswers || open) && (
                  <ol className="review-replies">
                    {question.answers.map(item => (
                      <li key={item.id} className="review-reply">
                        <div className="review-row">
                          <Avatar name={item.authorName} url={item.authorAvatarUrl} size={32} />
                          <div className="review-main">
                            <div className="review-bubble">
                              <div className="review-bubble-head">
                                <strong className="review-author">{item.authorName}</strong>
                                {item.authorIsStaff ? <span className="review-staff-badge">SUGI ASAYAKE</span> : <span className="product-question-tag">Худалдан авагч</span>}
                              </div>
                              <p className="review-text">{item.body}</p>
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
                        <form className="review-row" onSubmit={event => { event.preventDefault(); if (answerDraft.trim()) answer.mutate({ questionId: question.id, body: answerDraft.trim() }); }}>
                          <span className="review-avatar review-avatar--initials" style={{ width: 32, height: 32 }} aria-hidden="true">Та</span>
                          <div className="review-main">
                            <textarea value={answerDraft} onChange={event => setAnswerDraft(event.target.value)} maxLength={2000} rows={2} autoFocus placeholder="Хариулт бичих…" className="review-reply-input" aria-label="Хариулт" />
                            <div className="review-actions">
                              <button type="submit" className="review-action review-action--primary" disabled={answer.isPending || !answerDraft.trim()}>
                                {answer.isPending ? <LoaderCircle className="animate-spin" size={14} aria-hidden="true" /> : null} Илгээх
                              </button>
                              <button type="button" className="review-action" onClick={() => { setAnsweringId(null); setAnswerDraft(""); }}>Болих</button>
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
      )}
    </section>
  );
}
