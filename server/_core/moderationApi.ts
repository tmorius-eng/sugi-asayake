/**
 * LocalMod adapter (2026-09-13) — Tom-ийн r/selfhosted-оос сонгосон: нээлттэй эх,
 * MIT, бүрэн офлайн moderation API (https://github.com/KOKOSde/localmod). Текстийн
 * ангилагч: toxicity, spam, nsfw, pii, prompt_injection; зургийн ангилагч:
 * nsfw_image (Falconsai/nsfw_image_detection). Нэг Docker image, ~3.5GB загвар,
 * 1-3GB RAM, CPU дээр дуудлага бүрт ~50-500мс.
 *
 * Үнэнч хязгаар, дараа нь хэн ч гайхахгүйн тулд: LocalMod-ийн toxicity ensemble
 * ЗӨВХӨН АНГЛИ (toxic-bert, dehatebert-mono-english, roberta_toxicity, roberta-
 * hate-speech-dynabench). Англи сэтгэгдэлд бодит утгын дүгнэлт нэмнэ ("you people
 * are worthless"-д хараал байхгүй) харин монгол, орос, хятад доромжлолыг танихгүй.
 * Тэр нь moderation.ts-ийн lexical давхаргын үүрэг; хоёулаа хамт ажиллана.
 *
 * Холболт: MODERATION_API_URL (ж. http://127.0.0.1:8000) тавибал сэтгэгдлийн текст
 * ба avatar зургийн шүүлт хоёулаа түүнээс асууна. Тавиагүй бол энэ файл no-op.
 * Хүрэхгүй үйлчилгээ ТЕКСТэд log-логдож алгасагдана (lexical шийдвэр хүчинтэй),
 * ЗУРАГТ локал nsfwjs шийдвэр аль хэдийн эрх мэдэлтэй тул LocalMod тэнд ч хоёр
 * дахь санал л.
 */

const TEXT_CLASSIFIERS = ["toxicity", "spam", "nsfw"] as const;
const TIMEOUT_MS = 8_000;

type ClassifierResult = { classifier: string; flagged: boolean; confidence: number; severity?: string; categories?: string[] };
type AnalyzeResponse = { flagged: boolean; results: ClassifierResult[]; summary?: string; processing_time_ms?: number };

export function moderationApiUrl(): string | null {
  const url = process.env.MODERATION_API_URL?.trim().replace(/\/+$/, "");
  return url || null;
}

export function isModerationApiEnabled(): boolean {
  return moderationApiUrl() !== null;
}

async function call(path: string, init: RequestInit): Promise<AnalyzeResponse | null> {
  const base = moderationApiUrl();
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as AnalyzeResponse;
  } catch (error) {
    console.error(`[moderation-api] ${path} unavailable:`, error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type ApiTextVerdict = { flagged: boolean; classifier?: string; confidence?: number; severity?: string } | null;

/** Text screen. null = service not configured or unreachable. */
export async function screenTextWithApi(text: string): Promise<ApiTextVerdict> {
  const result = await call("/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, classifiers: TEXT_CLASSIFIERS }),
  });
  if (!result) return null;
  const hit = result.results.find(r => r.flagged);
  return hit ? { flagged: true, classifier: hit.classifier, confidence: hit.confidence, severity: hit.severity } : { flagged: false };
}

/** Image screen via multipart upload (field name `file`, per routes.py). */
export async function screenImageWithApi(image: Buffer, contentType: string): Promise<ApiTextVerdict> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(image)], { type: contentType }), "upload");
  const result = await call("/analyze/image/upload", { method: "POST", body: form });
  if (!result) return null;
  const hit = result.results.find(r => r.flagged);
  return hit ? { flagged: true, classifier: hit.classifier, confidence: hit.confidence, severity: hit.severity } : { flagged: false };
}

/** Maps LocalMod's classifier id onto our category vocabulary. */
export function categoryFromClassifier(classifier: string | undefined): "profanity" | "harassment" | "sexual" | "spam" {
  switch (classifier) {
    case "spam": return "spam";
    case "nsfw": return "sexual";
    case "toxicity": return "harassment";
    default: return "profanity";
  }
}
