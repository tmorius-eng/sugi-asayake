/**
 * Image safety screen for customer uploads (2026-09-13).
 *
 * Tom: registered customers must not be able to put nudity / +21 / obscene
 * images on their profile. Enforced HERE, on the server, on the bytes that
 * would be stored -- a client-side check could be skipped with one request.
 *
 * Model: nsfwjs "MobileNetV2Mid" (MIT; the weights ship inside the npm
 * package, so nothing is fetched at runtime and no image ever leaves this
 * server). It scores five classes -- Drawing, Hentai, Neutral, Porn, Sexy --
 * and runs on the pure-JS TensorFlow backend, which needs no native build on
 * the Windows laptops this runs on. ~0.3-1s per image on CPU, only on
 * uploads, so nothing else waits on it.
 *
 * Decoding: sharp (already a dependency) turns the upload into raw RGB at
 * 224px, which is the model's input size, so decode cost is negligible and
 * there is no dependency on tfjs-node's image codecs.
 *
 * Decision: block if Porn or Hentai is likely, or Sexy is dominant. The
 * thresholds are deliberately conservative for an AVATAR -- a swimsuit
 * photo is not what a shop's profile picture is for -- and every rejection
 * is logged with the scores (never the image) so they can be tuned from
 * real data. If the model cannot load, uploads are REFUSED, not waved
 * through: the check exists to enforce a rule, and a silent bypass would be
 * the worse failure. server/image-safety.test.ts proves the model loads.
 */

import sharp from "sharp";
import { screenImageWithApi } from "./moderationApi";

export type ImageSafetyScores = Record<"Drawing" | "Hentai" | "Neutral" | "Porn" | "Sexy", number>;

export type ImageSafetyVerdict =
  | { allowed: true; scores: ImageSafetyScores }
  | { allowed: false; scores: ImageSafetyScores; reason: "porn" | "hentai" | "sexy" };

export const IMAGE_SAFETY_REJECT_MESSAGE = "Энэ зураг профайлд тохирохгүй байна (нүцгэн эсвэл насанд хүрэгчдийн агуулга). Өөр зураг сонгоно уу.";

/** Probability above which Porn / Hentai blocks outright. */
export const PORN_THRESHOLD = 0.45;
/** "Sexy" (suggestive, not explicit) blocks only when it is clearly the
 *  dominant reading of the image. */
export const SEXY_THRESHOLD = 0.75;

const MODEL_INPUT = 224;

type Nsfw = { classify(img: unknown, topk?: number): Promise<{ className: string; probability: number }[]> };
type Tf = { tensor3d(values: Uint8Array, shape: [number, number, number], dtype: "int32"): { dispose(): void } };

let loading: Promise<{ model: Nsfw; tf: Tf }> | null = null;
/** Same memory policy as the text model: on demand, released after idle
 *  (avatar uploads are rarer still). */
export const IMAGE_MODEL_IDLE_MS = 10 * 60 * 1000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
function touch(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const current = loading;
    loading = null;
    void current?.then(({ model }) => { (model as unknown as { model?: { dispose?: () => void } }).model?.dispose?.(); console.log("[image-safety] released after idle"); }).catch(() => undefined);
  }, IMAGE_MODEL_IDLE_MS);
  idleTimer.unref?.();
}

/** Loads tfjs + the model once per process. Kicked off lazily on the first
 *  upload; call warmUpImageSafety() at boot to pay the ~1s load early. */
function load(): Promise<{ model: Nsfw; tf: Tf }> {
  if (!loading) {
    loading = (async () => {
      const tf = (await import("@tensorflow/tfjs")) as unknown as Tf & { setBackend(name: string): Promise<boolean>; ready(): Promise<void> };
      try {
        await tf.setBackend("cpu");
        await tf.ready();
      } catch {
        // The default backend still works; cpu is just the predictable one on
        // a server without a GPU.
      }
      const nsfwjs = await import("nsfwjs");
      const model = (await nsfwjs.load("MobileNetV2Mid")) as unknown as Nsfw;
      return { model, tf };
    })().catch(error => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

/** Boot-time check that the bundled weights load, then release. */
export function warmUpImageSafety(): void {
  void load().then(() => { touch(); }).catch(error => console.error("[image-safety] model failed to load:", error instanceof Error ? error.message : error));
}

/**
 * Scores an uploaded image. Throws if the model is unavailable -- callers
 * turn that into "try again later", never into an accepted upload.
 */
export async function classifyImageSafety(image: Buffer): Promise<ImageSafetyVerdict> {
  const { model, tf } = await load();
  touch();
  const { data, info } = await sharp(image)
    .rotate()
    .resize(MODEL_INPUT, MODEL_INPUT, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tensor = tf.tensor3d(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), [info.height, info.width, 3], "int32");
  try {
    const predictions = await model.classify(tensor, 5);
    const scores = { Drawing: 0, Hentai: 0, Neutral: 0, Porn: 0, Sexy: 0 } as ImageSafetyScores;
    for (const p of predictions) if (p.className in scores) scores[p.className as keyof ImageSafetyScores] = p.probability;
    if (scores.Porn >= PORN_THRESHOLD) return { allowed: false, scores, reason: "porn" };
    if (scores.Hentai >= PORN_THRESHOLD) return { allowed: false, scores, reason: "hentai" };
    if (scores.Sexy >= SEXY_THRESHOLD) return { allowed: false, scores, reason: "sexy" };
    // Second opinion from LocalMod's ViT NSFW classifier when configured
    // (MODERATION_API_URL). Either model flagging blocks the upload.
    const api = await screenImageWithApi(image, "image/jpeg");
    if (api?.flagged) return { allowed: false, scores, reason: "porn" };
    return { allowed: true, scores };
  } finally {
    tensor.dispose();
  }
}

/** Rounded scores for a log line -- never the image. */
export function formatScores(scores: ImageSafetyScores): string {
  return Object.entries(scores).map(([k, v]) => `${k.toLowerCase()}=${v.toFixed(2)}`).join(" ");
}
