import { MessageCircleQuestion, MessageSquareText, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useT } from "@/hooks/useLocale";

/**
 * "Reviews / Questions" jump links under the product title (2026-09-14,
 * Tom: "humuus ter bolgon anzaarahgui baina! Azaaragdah bolgoh heregtei").
 *
 * Both sections sit a long way down the page, after the description,
 * routine and related products, so shoppers never learned they existed.
 * Two pill links next to the rating tell them the sections are there,
 * carry the live counts, and scroll straight to them. A product with no
 * reviews yet invites the first one instead of showing "0".
 *
 * The question count comes from the same tRPC query ProductQuestions.tsx
 * makes further down (identical input), so React Query serves both from
 * one request.
 */
export default function ProductSectionJumps({ productId, reviewCount }: { productId: number; reviewCount: number }) {
  const t = useT();
  const questions = trpc.questions.list.useQuery({ productId });
  const questionCount = questions.data?.length ?? 0;
  const jump = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };
  return (
    <nav className="pdp-jumps" aria-label={t("Хуудасны хэсгүүд")}>
      <a href="#product-reviews" className="pdp-jump" onClick={jump("product-reviews")}>
        {reviewCount > 0 ? <Star size={14} aria-hidden="true" /> : <MessageSquareText size={14} aria-hidden="true" />}
        <span>{reviewCount > 0 ? t("{n} сэтгэгдэл").replace("{n}", String(reviewCount)) : t("Эхний сэтгэгдлийг бичих")}</span>
      </a>
      <a href="#product-questions" className="pdp-jump" onClick={jump("product-questions")}>
        <MessageCircleQuestion size={14} aria-hidden="true" />
        <span>{questionCount > 0 ? t("{n} асуулт, хариулт").replace("{n}", String(questionCount)) : t("Асуулт асуух")}</span>
      </a>
    </nav>
  );
}
