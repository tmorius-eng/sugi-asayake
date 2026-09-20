/**
 * Процесс доторх олон хэлний toxicity загвар (2026-09-13).
 *
 * Tom: Docker хэрэггүй, VPS-ийг иддэг нэмэлт үйлчилгээ хэрэггүй — гэхдээ шүүлт
 * хараалгүй бичсэн доромжлолыг хэд хэдэн хэлээр ойлгох ёстой. Энэ нь BERT toxicity
 * ангилагчийг Node процесс ДОТОР transformers.js + ONNX Runtime (CPU)-ээр ажиллуулна:
 *
 *   onnx-community/bert-multilingual-toxicity-classifier-ONNX
 *   (textdetox/bert-multilingual-toxicity-classifier-ийн ONNX export, орос, хятад,
 *   япон, герман, испани, араб, хинди зэрэг 15 хэлээр сургагдсан — монгол сургалтын
 *   багцад байхгүй тул монголыг moderation.ts-ийн lexical давхарга хариуцсаар;
 *   олон хэлний tokenizer кириллийг уншсаар, оросын шилжүүлэлт тусална.)
 *
 * Зардал: 8-бит quantised жин (~179MB) MODERATION_MODEL_DIR-т (анхдагч ./.cache/
 * moderation-model, git-ignored) нэг удаа татагдаад бүрэн офлайн. Ачаалагдсан үед
 * ~300-500MB RAM, лаптоп CPU дээр сэтгэгдэл бүрт ~100-300мс. Серверээс юу ч
 * гарахгүй. LocalMod (Docker, 3.5GB, зөвхөн англи toxicity)-той харьцуулахад жижиг,
 * container хэрэггүй, дэлгүүрийн бодитоор хардаг хэлүүдийг илүү хамарна.
 *
 * Бусад lexical бус давхарга шиг санаатай fail-open: загвар байхгүй эсвэл runtime
 * эхлэхгүй бол lexical шийдвэр хүчинтэй, асуудал нэг удаа log-логдоно.
 * MODERATION_MODEL=0 бүрмөсөн унтраана.
 *
 * САНАХ ОЙН БОДЛОГО (Tom, 2026-09-13: "ali boloh websited achaalal uguhgui"):
 * сэтгэгдэл өдөрт цөөн ирдэг тул загвар байнга санах ойд БАЙХГҮЙ. Сэтгэгдэлд
 * хэрэгтэй үед ачаалж, MODEL_IDLE_MS-ийн дараа өөр ирэхгүй бол dispose хийгдэж
 * процесс суурь RAM руугаа буцна. Boot дээр жинг зөвхөн диск рүү ПРЕФЕТЧ хийнэ (нэг
 * удаа ачаалж шууд dispose) — эхний бодит сэтгэгдэл 179MB татаалт хүлээхгүй, нэг
 * удаа хэдэн секундын CPU, дараа нь хэн нэгэн сэтгэгдэл бичтэл юу ч үгүй.
 */

import path from "node:path";
import { totalmem } from "node:os";

const MODEL_ID = "onnx-community/bert-multilingual-toxicity-classifier-ONNX";
/** Probability of the toxic class above which a text is refused. 0.6 rather
 *  than 0.5: reviews are short and often blunt ("terrible product"), and a
 *  false refusal of a legitimate complaint is the costlier mistake here. */
export const TOXIC_THRESHOLD = 0.6;
const TIMEOUT_MS = 6_000;

type Classifier = ((text: string, options?: { top_k?: number }) => Promise<{ label: string; score: number }[]>) & { dispose?: () => Promise<void> | void };

/**
 * How long a loaded model stays in memory after its last use.
 *
 * ⚠️ 2026-09-20 (хэмжсэн, таамаг биш): энэ хугацааг богиносгох нь санах ой
 * ХЭМНЭХГҮЙ. `dispose()` нь tensor-уудыг чөлөөлдөг ч процессын RSS үйлдлийн
 * систем рүү буцдаггүй (transformers.js/onnxruntime-ийн arena үлддэг) —
 * бодитоор хэмжсэн: текстийн загвар ачаалахад 102 → 470 MB, "сулруулсны"
 * дараа ч ~535 MB хэвээр. Харин дахин ачаалах бүр ТҮР ОРГИЛ үүсгэдэг
 * (683 → 799 MB ажиглагдсан). Тиймээс 10 минут нь зориудын сонголт:
 * цөөн дахин ачаалалт = цөөн оргил. Санах ойн цорын ганц бодит хөшүүрэг нь
 * "энэ процесст загвар ОГТ ачаалагдах уу" (`MODERATION_MODEL=0`), хугацаа биш.
 */
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

/**
 * Хост нь хоёр загварыг даах уу (2026-09-20-ны аудитын хэмжилтээс).
 *
 * Бодит production build дээр хэмжсэн тоо: сервер сул зогсоход **535 MB**,
 * текстийн загвар ачаалахад **+368 MB**, зургийнх дээрээс нь **+213 MB** —
 * хоёулаа хэрэглэгдсэн процесс **680–800 MB** орчимд тогтдог. Одоогийн
 * production хост нь 954 MB VM бөгөөд pm2 `--max-memory-restart 700M`-тэй, мөн
 * түүн дээр staging ч ажилладаг. Өөрөөр хэлбэл boot-ийн дараах эхний сэтгэгдэл
 * процессыг хязгаараас хальгаж, pm2 түүнийг ХҮСЭЛТИЙН ДУНДУУР restart хийнэ.
 *
 * Энэ нь чимээгүй байж болохгүй: `pm2 logs`-д тод мөр үлдээнэ. Аппыг өөрөө
 * зогсоохгүй — хостын шийдвэр (VM томсгох / `MODERATION_MODEL=0` / хязгаар
 * өсгөх) нь эзэмшигчийнх.
 */
export const LOW_MEMORY_HOST_BYTES = 1536 * 1024 * 1024;

/** Цэвэр: хостын нийт RAM-аас сэрэмжлүүлэх мөр (эсвэл null). Тестлэгдэнэ. */
export function lowMemoryWarning(totalBytes: number): string | null {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
  if (totalBytes >= LOW_MEMORY_HOST_BYTES) return null;
  const totalMb = Math.round(totalBytes / 1024 / 1024);
  return `[moderation-model] ⚠️ Энэ хост ${totalMb} MB RAM-тай. Текст + зургийн хоёр загвар хэрэглэгдмэгц процесс 680–800 MB хүрдэг нь хэмжигдсэн (pm2-ийн анхдагч --max-memory-restart 700M-ээс их). Сэтгэгдэл/аватар ирэхэд сервер хүсэлтийн дундуур restart болж магадгүй. Сонголтууд: (1) VM-ийн RAM нэмэх, (2) MODERATION_MODEL=0 болгож локал текстийн загварыг унтраах (монгол хэлний lexical шүүлт хэвээр ажиллана, ANTHROPIC_API_KEY байвал олон хэлний давхарга ч хэвээр), (3) pm2-ийн хязгаарыг ухамсартайгаар өсгөх.`;
}

let lowMemoryWarned = false;
function warnIfHostTooSmall(): void {
  if (lowMemoryWarned) return;
  lowMemoryWarned = true;
  const warning = lowMemoryWarning(totalmem());
  if (warning) console.warn(warning);
}

/** Boot-time PREFETCH: makes sure the weights are on disk, then releases
 *  the model again so it costs no memory until a review actually arrives. */
export function warmUpModerationModel(): void {
  if (!isModerationModelEnabled()) return;
  warnIfHostTooSmall();
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
