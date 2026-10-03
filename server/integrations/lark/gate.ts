import { isProductionSchemaUrl } from "../../../shared/dbUrl";
import { isBackgroundJobRunner } from "../../_core/clusterRole";

/**
 * Энэ процесс бодит Lark tenant руу бичиж болох уу (2026-10-03).
 *
 * Яагаад тусдаа хаалга вэ — дараах гурав хоёулаа prod DB-г уншдаг:
 *   • хоёр лаптоп `pnpm dev`-д `.env`-ийн `defaultdb` (production) руу заадаг
 *     бөгөөд `isBackgroundJobRunner()` тэнд ч true;
 *   • `sugi_staging` нь prod-ын хуулбар тул `integration_configs` (Lark-ийн
 *     нууц) ч хуулагдсан — шифрлэлтийн түлхүүр ижил бол тайлагдана;
 *   • тест (`NOTIFICATIONS_SUPPRESS=1`).
 * Тиймээс бодит илгээлт ДӨРВӨН нөхцөлийг хамтад нь шаардана: `LARK_PUSH=1`
 * (зөвхөн VM-ийн production `.env`-д), ард ажиллах ажлын эзэн, production схем
 * (эсвэл ухамсартай `LARK_ALLOW_NON_PRODUCTION=1`), тест биш.
 */
export type LarkGate = { allowed: boolean; reason: string };

function schemaCheck(env: NodeJS.ProcessEnv): LarkGate {
  if (env.LARK_ALLOW_NON_PRODUCTION === "1") return { allowed: true, reason: "LARK_ALLOW_NON_PRODUCTION=1" };
  const url = env.DATABASE_URL;
  if (!url) return { allowed: false, reason: "DATABASE_URL тохируулаагүй" };
  try {
    if (isProductionSchemaUrl(url)) return { allowed: true, reason: "production схем" };
  } catch {
    // Аюулгүй байдлын хаалга — задлагдахгүй URL дээр татгалзана.
    return { allowed: false, reason: "DATABASE_URL задлагдсангүй" };
  }
  return { allowed: false, reason: "production биш схем (staging/тест нь бодит Lark руу илгээхгүй)" };
}

/** Автомат илгээлт (чат карт, Base sync) — зөвхөн production сервер дээр. */
export function isLarkPushAllowed(env: NodeJS.ProcessEnv = process.env): LarkGate {
  if (env.NOTIFICATIONS_SUPPRESS === "1") return { allowed: false, reason: "тестийн горим (NOTIFICATIONS_SUPPRESS=1)" };
  if (env.LARK_PUSH !== "1") return { allowed: false, reason: "LARK_PUSH=1 энэ машин дээр тохируулаагүй" };
  if (!isBackgroundJobRunner()) return { allowed: false, reason: "ард ажиллах ажлууд өөр процесс дээр" };
  const schema = schemaCheck(env);
  return schema.allowed ? { allowed: true, reason: `илгээнэ (${schema.reason})` } : schema;
}

/** Admin-ий "Холболт шалгах"/"Туршилт" товч — `LARK_PUSH`-гүйгээр ажиллана
 *  (тохиргоог идэвхжүүлэхээс өмнө шалгахын тулд), харин staging/тестээс
 *  бодит tenant руу хэзээ ч явахгүй. */
export function isLarkTestAllowed(env: NodeJS.ProcessEnv = process.env): LarkGate {
  if (env.NOTIFICATIONS_SUPPRESS === "1") return { allowed: false, reason: "тестийн горим (NOTIFICATIONS_SUPPRESS=1)" };
  return schemaCheck(env);
}

/** Эхлэлийн log мөр — "Lark руу яагаад юу ч очихгүй байна" гэдгийг pm2 log хариулна. */
export function describeLarkGate(): string {
  const gate = isLarkPushAllowed();
  return `[lark] ${gate.allowed ? "ИДЭВХТЭЙ" : "унтраастай"}: ${gate.reason}`;
}
