/**
 * Царайны descriptor-ийн replay хамгаалалт (2026-10-01, аюулгүй байдлын scan #4).
 *
 * Асуудал: `livenessPassed` нь хөтөчийн өөрийн мэдүүлэг (камерын frame сервер рүү
 * хэзээ ч явдаггүй — нууцлалын үндэслэл). Нууц үгийг мэддэг халдагч өмнө нь ажигласан
 * (эсвэл хуулж авсан) descriptor-оо дахин илгээж болно. Ямар ч жинхэнэ камер ХОЁР удаа
 * бит-бит ижил descriptor гаргадаггүй (128 бодит тооны сүүлийн оронд шуугиан байдаг),
 * тиймээс:
 *   1. квантласан хэш (0.01 нарийвчлал) сүүлийн 30 хоногт энэ хэрэглэгчид аль хэдийн
 *      байсан бол татгалзана (face_attempts.detail-д ` d=<hash>` хэлбэрээр хадгалагдана);
 *   2. сүүлд АМЖИЛТТАЙ болсон descriptor-уудтай маш ойр (Евклидийн зай < 0.02)
 *      байвал татгалзана — хэш мөн квантын хил дээр бага зэрэг ялгарсан хуулбарыг барина.
 *
 * ⚠️ ШАЛГАГДААГҮЙ / ТОХИРУУЛААГҮЙ: 0.02 нь тооцоолсон таамаглал. Бодит камер нэг хүнийг
 * хэдэн секундын зайтай авахад ямар хамгийн бага зай гардгийг `face_attempts.distance`
 * (enrolment-тэй зай, хоорондын биш) ХЭМЖИХ боломжгүй — энэ хоёрдугаар шалгалт нь
 * descriptor-ыг хадгалахгүй (нууцлал) тул зөвхөн ПРОЦЕСС ДОТОР (сүүлийн 5 амжилттай,
 * 24 цаг, 200 хэрэглэгч) санах ойд байна: restart/өөр worker-т алдагдана. Анхны
 * бодит өгөгдөл цугларсны дараа (admin → Аюулгүй байдал → царайн оролдлого)
 * босгыг хянаж, хэрэгтэй бол өсгөх/бууруулах. Харин (1) нь DB-д тул тогтвортой.
 *
 * Зайг клиент рүү ХЭЗЭЭ Ч буцаахгүй (hill-climbing oracle) — зөвхөн татгалзсан гэсэн
 * үр дүн л гарна.
 */

import { createHash } from "node:crypto";
import { faceDescriptorDistance } from "../../shared/face-auth";

/** Энэ зайнаас бага (Евклид, FACE_MATCH_THRESHOLD=0.45-ийн ~4%) нь "ижил кадр" гэж үзнэ. ТОХИРУУЛААГҮЙ. */
export const FACE_REPLAY_NEAR_DISTANCE = 0.02;
export const FACE_REPLAY_WINDOW_DAYS = 30;
const QUANTIZE_STEP = 100; // 0.01
const KEEP_PER_USER = 5;
const MAX_USERS = 200;
const KEEP_MS = 24 * 60 * 60 * 1000;

/** 128 тоог 0.01-ээр бүхэл тоо болгож sha256-ийн эхний 16 hex. */
export function quantizedDescriptorHash(descriptor: readonly number[]): string {
  const quantized = descriptor.map(value => Math.round(value * QUANTIZE_STEP)).join(",");
  return createHash("sha256").update(quantized).digest("hex").slice(0, 16);
}

/** face_attempts.detail (varchar 160)-ийн төгсгөлд хэш нэмнэ; байгаа текстийг (шаардлагатай бол) тайрна. */
export function detailWithDescriptorHash(detail: string | null | undefined, hash: string): string {
  const suffix = ` d=${hash}`;
  const base = (detail ?? "").slice(0, 160 - suffix.length).trimEnd();
  return `${base}${suffix}`;
}

export function isNearDuplicate(candidate: readonly number[], previous: readonly (readonly number[])[], threshold = FACE_REPLAY_NEAR_DISTANCE): boolean {
  for (const prior of previous) {
    if (prior.length !== candidate.length) continue;
    if (faceDescriptorDistance(candidate, prior) < threshold) return true;
  }
  return false;
}

const accepted = new Map<number, { at: number; descriptor: number[] }[]>();

export function recentAcceptedDescriptors(userId: number, now = Date.now()): number[][] {
  const list = (accepted.get(userId) ?? []).filter(entry => now - entry.at < KEEP_MS);
  if (list.length) accepted.set(userId, list);
  else accepted.delete(userId);
  return list.map(entry => entry.descriptor);
}

export function rememberAcceptedDescriptor(userId: number, descriptor: readonly number[], now = Date.now()): void {
  if (!accepted.has(userId) && accepted.size >= MAX_USERS) {
    const oldest = accepted.keys().next().value;
    if (oldest !== undefined) accepted.delete(oldest);
  }
  const list = [...(accepted.get(userId) ?? []).filter(entry => now - entry.at < KEEP_MS), { at: now, descriptor: [...descriptor] }];
  accepted.set(userId, list.slice(-KEEP_PER_USER));
}

export function clearFaceReplayMemoryForTests(): void {
  accepted.clear();
}
