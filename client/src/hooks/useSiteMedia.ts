import { trpc, type RouterOutputs } from "@/lib/trpc";
import { bootstrapSlice } from "@/lib/bootstrap";

/**
 * `content.siteMedia`-г НЭГ газраас — серверийн бөглөж өгсөн bootstrap блокоор
 * эхлүүлж (2026-09-21, client/src/lib/bootstrap.ts).
 *
 * Утасны LCP-ийн хамгийн том хэсэг нь "render delay" байсан: JS ирсний дараа ч
 * hero нь `siteMedia` tRPC хариуг хүлээж (`mediaReady`) хоосон зай зурж
 * байв. indexHtml.ts аль хэдийн 60 с кэштэй `getSiteMedia()` уншдаг тул
 * мөрүүдийг HTML-д хамт өгвөл React-ийн ЭХНИЙ render нь бодит зургуудаа
 * мэднэ — нэмэлт хүсэлт, хүлээлт байхгүй; `isLoading` анхнаасаа false.
 */
type SiteMediaRows = RouterOutputs["content"]["siteMedia"];

const bootstrap = bootstrapSlice<SiteMediaRows>("siteMedia");

export function useSiteMedia() {
  return trpc.content.siteMedia.useQuery(undefined, bootstrap
    ? { initialData: bootstrap.data, initialDataUpdatedAt: bootstrap.at }
    : undefined);
}
