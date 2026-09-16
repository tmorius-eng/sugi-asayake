/**
 * Admin шинэчлэл (2026-09-08, Phase L): энгийн in-memory, процесс бүрийн TTL cache
 * — Redis-гүй, энэ төслийн нэг процессын бодит байдалд нийцсэн (rate-limit bucket,
 * SQL query log-ийн ring buffer-т аль хэдийн хүлээн зөвшөөрсөн ижил tradeoff). Нэг
 * query давхаргын дотор биш дуудлагын цэг бүрт хэрэглэгддэг тул cache түлхүүр тухайн
 * дуудлагын яг ашигласан filter параметрийг агуулж чадна — зайлсхийх ёстой цорын
 * ганц бодит алдаа нь кэшлэгдсэнээс *өөр* filter-т хуучин үр дүн өгөх.
 *
 * Eviction-д санаатайгаар энгийн: LRU-гүй. Хуучрах цонх (audit/login/SQL log ба
 * storefront-ийн контент уншилтад 30с, гуравдагч талын Honeybadger дуудлагад 60с)
 * нь эдгээр уншилт ихтэй, яаралтай биш харагдацуудын зориулалтын зан төлөв, засах
 * ёстой bug биш.
 */

type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();
/**
 * When each key was last invalidated. Needed because a write and a read can
 * overlap: a reader that started its query BEFORE a writer changed the row
 * would otherwise hand back the pre-write value and store it for the full
 * TTL, so an admin's edit would appear to do nothing for 30 seconds. A result
 * computed before the most recent invalidation is returned to its caller but
 * never cached.
 */
const invalidatedAt = new Map<string, number>();
/**
 * Ачааллын бэлтгэл (2026-09-16): яг ОДОО тооцоологдож буй түлхүүрүүд.
 *
 * TTL cache нь ачаалал багатай үед л "нэг query 30 секундэд нэг удаа" гэсэн
 * амлалтаа биелүүлдэг байв: оргил ачаалалд entry хугацаа дуусах агшинд ирсэн
 * БҮХ зэрэгцээ хүсэлт cache-ийг хоосон харж, бүгд өөрсдийн query-г эхлүүлнэ
 * (thundering herd). 500 зэрэгцээ зочинтой үед 30 секунд тутамд 500 ижил
 * query DB рүү явна — хамгаалалт нь хамгийн хэрэгтэй яг тэр мөчид алга болдог.
 *
 * Тиймээс нэг түлхүүрт нэг л тооцоолол явна; бусад дуудагч түүний promise-д
 * нэгдэнэ. Дуудагчийн хувьд зан төлөв өөрчлөгдөхгүй (ижил утга, ижил алдаа).
 *
 * Хүчингүй болголттой харилцах нь нарийн: тооцоолол эхэлснээс ХОЙШ түлхүүр
 * хүчингүй болсон бол шинээр ирсэн дуудагч түүнд нэгдэж БОЛОХГҮЙ — эс бөгөөс
 * admin засвараа хадгалаад шууд уншихад засварын өмнөх утга буцна. Тийм үед
 * шинэ тооцоолол эхэлнэ.
 */
const inFlight = new Map<string, { startedAt: number; promise: Promise<unknown> }>();

export async function getOrSetCached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const cached = store.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const running = inFlight.get(key);
  // ЧАНГА `>`: `Date.now()` нь миллисекундын нарийвчлалтай тул хадгалах товч
  // дарсан admin-ий хүчингүй болголт нь яг тэр миллисекундэд эхэлсэн уншилттай
  // тэнцэж болно. Тэнцүү бол нэгдэхгүй — уншигч хуучин утга авахаас илүү нэг
  // илүү query явуулсан нь дээр (доод талын `lastInvalidated >= startedAt`
  // шалгалт ч яг ижил болгоомжтой талдаа).
  if (running && running.startedAt > (invalidatedAt.get(key) ?? 0)) return running.promise as Promise<T>;
  const startedAt = Date.now();
  const entry = {
    startedAt,
    promise: (async () => {
      const value = await compute();
      const lastInvalidated = invalidatedAt.get(key) ?? 0;
      if (lastInvalidated >= startedAt) return value;
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })(),
  };
  inFlight.set(key, entry);
  try {
    return (await entry.promise) as T;
  } finally {
    // Зөвхөн ӨӨРИЙН бичлэгээ ус — хүчингүй болголтын дараа эхэлсэн шинэ
    // тооцоолол энэ хооронд бичигдсэн байж болно.
    if (inFlight.get(key) === entry) inFlight.delete(key);
  }
}

/** Drops one entry. Added 2026-09-11 for integration settings: a staleness
 *  window is fine for a read-only log view, but not for "I just pasted a new
 *  ntfy topic and pressed Test". Only clears THIS process's copy -- the other
 *  laptop picks the change up when its own entry expires. */
export function invalidateCached(key: string): void {
  store.delete(key);
  invalidatedAt.set(key, Date.now());
}

/** Drops every entry whose key starts with `prefix` -- for keys that carry a
 *  parameter (`storefront:bestsellers:8`, `storefront:related:<id>:6`), which a
 *  writer cannot enumerate. Same invalidation mark per dropped key as above. */
export function invalidateCachedByPrefix(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) invalidateCached(key);
  // A key not currently stored may be mid-compute; mark the prefix's known
  // keys only -- an in-flight compute for an unseen key stores its result,
  // which the 30 s TTL then bounds. Acceptable for these rails.
}

/** Test seam: forget everything, including the invalidation marks. */
export function clearCacheForTests(): void {
  store.clear();
  invalidatedAt.clear();
  inFlight.clear();
}
