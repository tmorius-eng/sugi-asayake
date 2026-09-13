/**
 * In-process multilingual toxicity model (2026-09-13).
 *
 * Tom: no Docker, no extra service eating the VPS -- but the abuse screen
 * must understand insults written without swear words, in several
 * languages. This runs a BERT toxicity classifier INSIDE the Node process
 * through transformers.js + ONNX Runtime (CPU):
 *
 *   onnx-community/bert-multilingual-toxicity-classifier-ONNX
 *   (ONNX export of textdetox/bert-multilingual-toxicity-classifier,
 *   trained on 15 languages incl. Russian, Chinese, Japanese, German,
 *   Spanish, Arabic, Hindi -- Mongolian is not in the training set, so the
 *   lexical layer in moderation.ts stays responsible for Mongolian; the
 *   multilingual tokenizer still reads Cyrillic and Russian transfer helps.)
 *
 * Cost: one-time download of the 8-bit quantised weights (~179MB) into
 * MODERATION_MODEL_DIR (default ./.cache/moderation-model, git-ignored),
 * then fully offline. ~300-500MB RAM while loaded, ~100-300ms per review on
 * a laptop CPU. Nothing leaves the server. Compared with LocalMod (Docker,
 * 3.5GB, English-only toxicity) this is smaller, needs no container and
 * covers more of the languages the shop actually sees.
 *
 * Fail-open by design, like the other non-lexical layers: if the model is
 * missing or the runtime cannot start, the lexical verdict stands and the
 * problem is logged once. Set MODERATION_MODEL=0 to disable entirely.
 *
 * MEMORY POLICY (Tom, 2026-09-13: "ali boloh websited achaalal uguhgui"):
 * reviews arrive a few times a day, so the model is NOT kept resident. It
 * loads on demand for a review, is disposed after MODEL_IDLE_MS without
 * another one, and the process goes back to its baseline RAM. At boot the
 * weights are only PREFETCHED to disk (load once, dispose immediately) so
 * the first real review never waits on a 179MB download -- a few seconds of
 * CPU once, then nothing until someone actually writes a review.
 */

import path from "node:path";

const MODEL_ID = "onnx-community/bert-multilingual-toxicity-classifier-ONNX";
/** Probability of the toxic class above which a text is refused. 0.6 rather
 *  than 0.5: reviews are short and often blunt ("terrible product"), and a
 *  false refusal of a legitimate complaint is the costlier mistake here. */
export const TOXIC_THRESHOLD = 0.6;
const TIMEOUT_MS = 6_000;

type Classifier = ((text: string, options?: { top_k?: number }) => Promise<{ label: string; score: number }[]>) & { dispose?: () => Promise<void> | void };

/** How long a loaded model stays in memory after its last use. */
export const MODEL_IDLE_MS = 10 * 60 * 1000;

let loading: Promise<Classifier> | null = null;
let disabledReason: string | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function unload(): Promise<void> {
  const current = loading;
  loading = null;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (!current) return;
  try {
    const classifier = await current;
    await classifier.dispose?.();
    console.log("[moderation-model] released after idle");
  } catch {
    // Already failed to load; nothing to free.
  }
}

function touch(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { void unload(); }, MODEL_IDLE_MS);
  // Never keep the process alive just for this timer.
  idleTimer.unref?.();
}

export function isModerationModelEnabled(): boolean {
  return process.env.MODERATION_MODEL !== "0" && process.env.NODE_ENV !== "test";
}

async function load(): Promise<Classifier> {
  if (!loading) {
    loading = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.cacheDir = process.env.MODERATION_MODEL_DIR || path.resolve(process.cwd(), ".cache", "moderation-model");
      env.allowLocalModels = true;
      const classifier = (await pipeline("text-classification", MODEL_ID, { dtype: "q8" })) as unknown as Classifier;
      return classifier;
    })().catch(error => {
      loading = null;
      disabledReason = error instanceof Error ? error.message : String(error);
      throw error;
    });
  }
  return loading;
}

/** Boot-time PREFETCH: makes sure the weights are on disk, then releases
 *  the model again so it costs no memory until a review actually arrives. */
export function warmUpModerationModel(): void {
  if (!isModerationModelEnabled()) return;
  void load().then(
    async () => { console.log("[moderation-model] weights ready on disk:", MODEL_ID); await unload(); },
    error => console.error("[moderation-model] unavailable, lexical layer only:", error instanceof Error ? error.message : error),
  );
}

export type ModelVerdict = { toxic: boolean; score: number; label: string } | null;

/**
 * Scores one text. null = model disabled or unavailable (caller falls back).
 * The exported classifier labels vary between exports ("toxic"/"neutral" or
 * "LABEL_1"/"LABEL_0"); both spellings are handled.
 */
export async function screenTextWithModel(text: string): Promise<ModelVerdict> {
  if (!isModerationModelEnabled() || disabledReason) return null;
  try {
    const classifier = await load();
    touch();
    const result = await Promise.race([
      classifier(text.slice(0, 2_000), { top_k: 2 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    const toxicEntry = result.find(r => /toxic|label_1/i.test(r.label));
    const score = toxicEntry?.score ?? 0;
    return { toxic: score >= TOXIC_THRESHOLD, score, label: toxicEntry?.label ?? "?" };
  } catch (error) {
    console.error("[moderation-model] inference failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
