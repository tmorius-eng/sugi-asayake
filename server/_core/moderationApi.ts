/**
 * LocalMod adapter (2026-09-13) -- Tom's pick from r/selfhosted: an
 * open-source, MIT, fully offline moderation API
 * (https://github.com/KOKOSde/localmod). Text classifiers: toxicity, spam,
 * nsfw, pii, prompt_injection; image classifier: nsfw_image
 * (Falconsai/nsfw_image_detection). One Docker image, ~3.5GB of models,
 * 1-3GB RAM, ~50-500ms per call on a CPU.
 *
 * Honest limits, so nobody is surprised later: LocalMod's toxicity ensemble
 * is ENGLISH-ONLY (toxic-bert, dehatebert-mono-english, roberta_toxicity,
 * roberta-hate-speech-dynabench). It adds real semantic judgement for
 * English reviews ("you people are worthless" has no swear word), but it
 * will not recognise Mongolian, Russian or Chinese abuse. That is what the
 * lexical layer in moderation.ts is for; the two run together.
 *
 * Wiring: set MODERATION_API_URL (e.g. http://127.0.0.1:8000) and both the
 * review text screen and the avatar image screen consult it. Unset, this
 * file is a no-op. An unreachable service is logged and skipped for TEXT
 * (the lexical verdict stands) but for IMAGES the local nsfwjs verdict is
 * already authoritative, so LocalMod is a second opinion there too.
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
