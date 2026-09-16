/**
 * Ачааллын бэлтгэл (2026-09-16): олон процесс зэрэг ажиллах үед аль нь ард
 * ажиллах ажлуудыг (scheduler, мэдэгдлийн dispatcher) эзэмшихийг шийднэ.
 *
 * Яагаад хэрэгтэй вэ: `server/_core/index.ts` процесс бүртээ `startScheduler()`
 * болон `startNotificationDispatcher()`-ийг дуудна. Нэг процессын үед энэ зөв.
 * pm2-ийг cluster горимд (`pm2 start dist/index.js -i 2`) ажиллуулбал ижил
 * файл N удаа ачаалагдана — ямар ч хамгаалалтгүй бол орхигдсон сагсны сануулга,
 * вендорын үлдэгдлийн таталт, өгөгдлийн цэвэрлэгээ бүр N дахин ажиллана.
 * Scheduler-ийн due-ness шалгалт нь процессын доторх `runningJobNames`-ээр л
 * хамгаалагддаг (server/_core/scheduler.ts) — DB түвшний claim/lock БАЙХГҮЙ тул
 * хоёр процесс ижил job-ыг ижил секундэд due гэж уншаад хоёулаа ажиллуулж
 * чадна.
 *
 * pm2 нь cluster горимд worker бүрд `NODE_APP_INSTANCE`-ийг 0,1,2… гэж өгдөг
 * (fork горимд ч "0" гэж өгдөг), тиймээс "instance 0 эзэмшинэ" гэсэн дүрэм
 * хоёуланд нь зөв ажиллана. Хувьсагч огт байхгүй үед (гараар `node dist/index.js`,
 * `pnpm dev`, тест) мөн эзэмшинэ — өөрөөр хэлбэл энэ нэмэлт нь одоогийн зан
 * төлөвийг хэзээ ч өөрчлөхгүй, зөвхөн cluster горимыг аюулгүй болгоно.
 *
 * `RUN_BACKGROUND_JOBS=0/1` нь эцсийн шийдэгч: тусад нь зөвхөн ажил гүйцэтгэх
 * процесс (web траффик хүлээж авахгүй) гаргах болон staging дээр ард ажиллах
 * ажлуудыг бүрэн унтраах хоёуланд нь хэрэгтэй.
 *
 * ⚠️ Cluster горимд шилжихийн ӨМНӨ мэдэж байх ёстой (2026-09-16-нд хэмжсэн):
 * бодит VM нь 2 vCPU / 954 MB RAM бөгөөд production + staging хоёулаа тэнд
 * ажиллаж байна (сул зай ~312 MB). Нэг instance ~130 MB эзэлдэг тул RAM
 * нэмэгдэх хүртэл `-i 2` нь ашиг багатай, эрсдэл өндөртэй. Энэ модуль нь тэр
 * өдөр ирэхэд кодыг бэлэн байлгах зорилготой — доорх процессын доторх төлөвүүд
 * мөн процесс бүрд тусдаа байхыг санах:
 *   • `_core/ttlCache.ts` — 30–60с TTL, invalidate зөвхөн өөрийн процесст
 *     хүрнэ (admin нэг засвар хийхэд нөгөө worker хамгийн ихдээ TTL-ийн
 *     хугацаанд хуучин утга өгнө).
 *   • `_core/security.ts`-ийн in-memory bucket-ууд — global limiter N дахин
 *     өгөөмөр болно (strict tier-үүд DB дээр тоолдог тул хөндөгдөхгүй:
 *     `_core/persistentRateLimit.ts`).
 *   • `_core/sqlQueryLog.ts`-ийн ring buffer — admin "SQL лог" tab зөвхөн
 *     тухайн хүсэлтийг үйлчилсэн worker-ийн мөрийг харуулна.
 */

/** Энэ процесс scheduler/dispatcher-ийг эзэмших үү. */
export function isBackgroundJobRunner(): boolean {
  const explicit = process.env.RUN_BACKGROUND_JOBS;
  if (explicit === "1") return true;
  if (explicit === "0") return false;
  const instance = process.env.NODE_APP_INSTANCE;
  return instance === undefined || instance.trim() === "" || instance.trim() === "0";
}

/** Эхлэлийн log мөрөнд бичих тайлбар — "яагаад миний job ажиллахгүй байна вэ"
 *  гэсэн асуултыг pm2 log дээр шууд хариулна. */
export function describeClusterRole(): string {
  const instance = process.env.NODE_APP_INSTANCE?.trim();
  const who = instance === undefined || instance === "" ? "single process" : `pm2 instance ${instance}`;
  return isBackgroundJobRunner() ? `${who}: ард ажиллах ажлууд ЭНД ажиллана` : `${who}: ард ажиллах ажлууд ӨӨР instance дээр`;
}
