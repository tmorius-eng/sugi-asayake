import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { faceHandoffRequests } from "../drizzle/schema";
import { getDb } from "./db";
import { logAdminAction } from "./db";
import { issueFaceProof, requireRealTab, tabIdFrom } from "./_core/faceProof";
import { ENV } from "./_core/env";
import { enqueueNotification } from "./notificationOutbox";
import {
  FACE_HANDOFF_IDLE_TIMEOUT_MS,
  FACE_HANDOFF_NUMBER_CHOICES,
  FACE_HANDOFF_TTL_MS,
} from "../shared/face-auth";

/**
 * Камергүй компьютер дээр admin-д нэвтрэх "handoff" (2026-09-16).
 * Дизайн, аюулгүй байдлын бүрэн үндэслэл: **docs/FACE-HANDOFF-PLAN.md**.
 *
 * Зарчим (энэ файлын бүх шийдвэрийн үндэс): QR-ийг **баталгаажуулах
 * шаардлагатай компьютер** үүсгэнэ, утас нь **шинэ сесс үүсгэхгүй** — зөвхөн
 * тухайн компьютерийн АЛЬ ХЭДИЙН нэвтэрсэн сессийг нээнэ. OWASP-ийн
 * QRLJacking нь "уншуулсан хүний баталгаагаар халдагчийн сесс нээгддэг"
 * механизм дээр тогтдог; энд утас юу ч нээхгүй, зөвхөн өөрийн дансны
 * компьютерийг л нээнэ.
 *
 * Хэрэглэгчийн сонголтоор (Tom, 2026-09-16):
 *  - утас **өөр IP/сүлжээнд** байж болно (BLE/ижил Wi-Fi шаардахгүй);
 *  - **бүх panel role** ашиглана (зөвхөн admin биш);
 *  - handoff-оор нээгдсэн сессийн идэвхгүй түгжээ **10 минут**.
 *
 * Ойролцоо байгааг нотлох BLE байхгүй тул түүний оронд **тоо тааруулах**
 * (Microsoft Entra-ийн push ядаргааны эсрэг арга) + утсан дээр **юуг баталж
 * байгаагаа харуулах** контекст хоёрыг ашиглана.
 */

const TOKEN_BYTES = 32;

/** Түүхий token хэзээ ч DB-д очихгүй: уншсан хүн ямар ч хүлээгдэж буй
 *  handoff-ийг баталж чадахгүй байх ёстой. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** "Chrome · Windows" — мэдэгдэлд болон утасны дэлгэц дээр харуулах товч
 *  тайлбар. User-Agent-ийг бүтнээр нь хэзээ ч харуулахгүй (уншигдахгүй). */
export function describeUserAgent(agent: string | undefined): string {
  if (!agent) return "Тодорхойгүй хөтөч";
  const browser = /Edg\//.test(agent) ? "Edge"
    : /OPR\/|Opera/.test(agent) ? "Opera"
    : /Firefox\//.test(agent) ? "Firefox"
    : /Chrome\//.test(agent) ? "Chrome"
    : /Safari\//.test(agent) ? "Safari"
    : "Хөтөч";
  const platform = /Windows NT/.test(agent) ? "Windows"
    : /Mac OS X/.test(agent) ? "macOS"
    : /Android/.test(agent) ? "Android"
    : /(iPhone|iPad|iOS)/.test(agent) ? "iOS"
    : /Linux/.test(agent) ? "Linux"
    : "Тодорхойгүй";
  return `${browser} · ${platform}`;
}

/**
 * Компьютер дуудна: шинэ handoff хүсэлт үүсгээд QR-д хийх token, компьютер
 * дээр харуулах тоо, дуусах хугацааг буцаана.
 *
 * Тухайн хэрэглэгчийн өмнөх хүлээгдэж буй хүсэлтүүдийг `expired` болгоно —
 * нэг агшинд зөвхөн НЭГ л QR хүчинтэй байх ёстой, эс бөгөөс дэлгэц дээр
 * удаан үлдсэн хуучин QR-ууд зэрэг ажиллана.
 */
export async function startFaceHandoff(input: { userId: number; sessionVersion: number; req: Request }): Promise<{ token: string; matchNumber: number; expiresAt: Date }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Өгөгдлийн сан бэлэн биш байна." });

  // 2026-09-27: tab id-гүй хүсэлтийг ЭНД татгалзана — өмнө нь "-" гэж хадгалаад,
  // утсаар баталсны дараа claim дээр `used` болгосны ДАРАА л proof үүсгэхэд унадаг
  // тул handoff дэмий шатдаг байв.
  const tabId = requireRealTab(input.req);
  await db.update(faceHandoffRequests).set({ status: "expired" })
    .where(and(eq(faceHandoffRequests.userId, input.userId), eq(faceHandoffRequests.status, "pending")));

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  // 10..99: утсан дээр бусад сонголтуудаас ялгарах хангалттай, нүдээр
  // харьцуулахад хялбар хоёр орон. CSPRNG (2026-09-22 аудит) — Math.random-ын
  // дарааллыг таах онолын боломжийг ч үлдээхгүй.
  const matchNumber = randomInt(10, 100);
  const expiresAt = new Date(Date.now() + FACE_HANDOFF_TTL_MS);
  await db.insert(faceHandoffRequests).values({
    tokenHash: hashToken(token),
    userId: input.userId,
    sessionVersion: input.sessionVersion,
    adminTabId: tabId,
    matchNumber,
    desktopIp: input.req.ip ?? null,
    desktopAgent: (input.req.headers?.["user-agent"] as string | undefined)?.slice(0, 200) ?? null,
    expiresAt,
  });
  return { token, matchNumber, expiresAt };
}

type LoadedRequest = typeof faceHandoffRequests.$inferSelect;

/** Token-оор мөр олоод хугацаа дууссаныг нь тэр даруй хаана. */
async function loadRequest(token: string): Promise<LoadedRequest | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(faceHandoffRequests).where(eq(faceHandoffRequests.tokenHash, hashToken(token))).limit(1);
  if (!row) return null;
  // 2026-09-23: "approved" мөр ч хугацаа дуусна. Өмнө нь зөвхөн "pending"
  // хугацаагаар хаагддаг тул батлагдсаны дараа мөр 24 цагийн цэвэрлэгээ
  // хүртэл "approved" хэвээр үлдэж, ижил token + хэрэглэгч + sessionVersion +
  // таб дээр ХЭД ЧАСЫН ДАРАА ч proof cookie мөнгөлдөг байв — "нэг QR 90
  // секунд хүчинтэй" гэсэн загварын баталгаа зөвхөн батлахаас өмнө биелж байв.
  // Батлахад цаг хэрэгтэй тул жижиг нөөц хугацаа (grace) нэмнэ.
  const APPROVED_GRACE_MS = 60_000;
  const deadline = row.expiresAt.getTime() + (row.status === "approved" ? APPROVED_GRACE_MS : 0);
  if ((row.status === "pending" || row.status === "approved") && deadline <= Date.now()) {
    await db.update(faceHandoffRequests).set({ status: "expired" }).where(and(eq(faceHandoffRequests.id, row.id), inArray(faceHandoffRequests.status, ["pending", "approved"])));
    return { ...row, status: "expired" };
  }
  return row;
}

export type HandoffContext = {
  device: string;
  ip: string | null;
  requestedAt: Date;
  expiresAt: Date;
  /** Тоо тааруулах сонголтууд (зөв нь дотор нь нэг). */
  numberChoices: number[];
  /** Утасны IP компьютерийнхээс өөр эсэх — хориглохгүй, зөвхөн ХАРУУЛНА. */
  differentNetwork: boolean;
};

/**
 * Утас дуудна: юуг баталж байгаагаа харуулахын тулд. Тоог ӨӨРИЙГ нь
 * буцаахгүй — зөвхөн сонголтуудыг (зөв нь дотор нь). Ингэснээр утас нь
 * компьютерийн дэлгэцийг бодитоор харахгүйгээр таамаглах боломж
 * 1/FACE_HANDOFF_NUMBER_CHOICES болно.
 */
export async function getFaceHandoffContext(input: { token: string; userId: number; sessionVersion: number; req: Request }): Promise<HandoffContext> {
  const row = await loadRequest(input.token);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Энэ QR код хүчингүй байна. Компьютер дээрээ шинэ код гаргана уу." });
  // Хэрэглэгч таарахгүй бол ЯМАР Ч мэдээлэл өгөхгүй — өөр хүний компьютерийн
  // хөтөч/IP-г танихгүй хүнд харуулах ёсгүй.
  if (row.userId !== input.userId) throw new TRPCError({ code: "FORBIDDEN", message: "Энэ QR код өөр хэрэглэгчийнх байна. Өөрийн дансаараа нэвтэрнэ үү." });
  if (row.sessionVersion !== input.sessionVersion) throw new TRPCError({ code: "FORBIDDEN", message: "Нэвтрэлт шинэчлэгдсэн тул энэ код хүчингүй боллоо." });
  if (row.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: row.status === "expired" ? "Энэ кодны хугацаа дууссан. Компьютер дээрээ шинэ код гаргана уу." : "Энэ кодыг аль хэдийн ашигласан байна." });

  // 2026-09-27: хуурамч тоонууд хүсэлт бүрт ИЖИЛ (мөрөөс + серверийн нууцаас
  // тодорхойлогдоно). Өмнө нь дуудалт бүрт шинээр сонгогддог тул хоёр хариуны
  // огтлолцол нь жинхэнэ тоог шууд хэлдэг байв ("1/3 таамаг" баталгаа худал).
  let draw = 0;
  const stableInt = (min: number, max: number) => {
    const digest = createHmac("sha256", ENV.cookieSecret || "face-handoff").update(`${row.id}:${row.createdAt.getTime()}:${draw++}`).digest();
    return min + (digest.readUInt32BE(0) % (max - min));
  };
  const choices = new Set<number>([row.matchNumber]);
  while (choices.size < FACE_HANDOFF_NUMBER_CHOICES) choices.add(stableInt(10, 100));
  // Fisher–Yates: `sort(() => Math.random() - 0.5)` нь хазайлттай — зөв тоо
  // эхний байранд илүү олон удаа гардаг байсан (таахад тус болно).
  const shuffled = [...choices];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = stableInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return {
    device: describeUserAgent(row.desktopAgent ?? undefined),
    ip: row.desktopIp,
    requestedAt: row.createdAt,
    expiresAt: row.expiresAt,
    numberChoices: shuffled,
    differentNetwork: Boolean(row.desktopIp && input.req.ip && row.desktopIp !== input.req.ip),
  };
}

/**
 * Утас дуудна, царайны шалгалтын ӨМНӨ: token хүчинтэй эсэх, миний эсэх, тоо
 * таарч байгаа эсэх.
 *
 * Дараалал чухал: тоог царайнаас ӨМНӨ шалгана. Буруу тоо нь халдлагын шинж
 * (хэн нэгэн өөрийн дэлгэц дээрх QR-ийг уншуулсан байж болно) тул тэр
 * тохиолдолд царайны шалгалтыг огт эхлүүлэхгүй, challenge ч зарцуулахгүй,
 * хүсэлтийг шууд хаана — дахин таах боломжгүй.
 */
export async function assertHandoffApprovable(input: { token: string; userId: number; sessionVersion: number; matchNumber: number; req: Request }): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Өгөгдлийн сан бэлэн биш байна." });
  const row = await loadRequest(input.token);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Энэ QR код хүчингүй байна." });
  if (row.userId !== input.userId || row.sessionVersion !== input.sessionVersion) throw new TRPCError({ code: "FORBIDDEN", message: "Энэ QR код таных биш байна." });
  if (row.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ кодны хугацаа дууссан эсвэл аль хэдийн ашиглагдсан." });

  if (row.matchNumber !== input.matchNumber) {
    await db.update(faceHandoffRequests).set({ status: "denied", approvedByIp: input.req.ip ?? null, approvedAt: new Date() }).where(eq(faceHandoffRequests.id, row.id));
    await logAdminAction({ actorUserId: input.userId, action: "face.handoff_wrong_number", entityType: "face_handoff", entityId: row.id, metadata: { device: describeUserAgent(row.desktopAgent ?? undefined) } });
    throw new TRPCError({ code: "BAD_REQUEST", message: "Тоо таарсангүй. Компьютер дээрээ шинэ код гаргаад дахин оролдоно уу." });
  }
}

/**
 * Утас дуудна: тоо таарч, ЦАРАЙ нь шалгагдсаны дараа. Төлвийг нөхцөлт
 * UPDATE-ээр ахиулна ('pending' байвал л) — хоёр зэрэг оролдлогоос зөвхөн
 * нэг нь амжина.
 */
export async function approveFaceHandoff(input: { token: string; userId: number; sessionVersion: number; matchNumber: number; req: Request }): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Өгөгдлийн сан бэлэн биш байна." });
  const row = await loadRequest(input.token);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Энэ QR код хүчингүй байна." });
  if (row.userId !== input.userId || row.sessionVersion !== input.sessionVersion) throw new TRPCError({ code: "FORBIDDEN", message: "Энэ QR код таных биш байна." });
  if (row.status !== "pending" || row.matchNumber !== input.matchNumber) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ кодны хугацаа дууссан эсвэл аль хэдийн ашиглагдсан." });

  const claimed = await db.update(faceHandoffRequests)
    .set({ status: "approved", approvedAt: new Date(), approvedByIp: input.req.ip ?? null })
    .where(and(eq(faceHandoffRequests.id, row.id), eq(faceHandoffRequests.status, "pending")));
  if (Number(claimed[0].affectedRows ?? 0) !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Энэ кодыг аль хэдийн ашигласан байна." });

  const device = describeUserAgent(row.desktopAgent ?? undefined);
  await logAdminAction({ actorUserId: input.userId, action: "face.handoff_approved", entityType: "face_handoff", entityId: row.id, metadata: { device, desktopIp: row.desktopIp, approvedByIp: input.req.ip ?? null } });
  // ⚠️ Мэдэгдэлд ЗӨВХӨН хөтөч/OS (ntfy сэдэв нээлттэй) — IP, байршил
  // хэзээ ч орохгүй. Дэлгэрэнгүйг audit лог хадгална.
  await enqueueNotification(db, "admin.handoff_approved", { device });
}

/** Утас "энэ би биш" гэж дарвал. */
export async function denyFaceHandoff(input: { token: string; userId: number }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const row = await loadRequest(input.token);
  if (!row || row.userId !== input.userId || row.status !== "pending") return;
  await db.update(faceHandoffRequests).set({ status: "denied", approvedAt: new Date() }).where(eq(faceHandoffRequests.id, row.id));
  await logAdminAction({ actorUserId: input.userId, action: "face.handoff_denied", entityType: "face_handoff", entityId: row.id, metadata: { device: describeUserAgent(row.desktopAgent ?? undefined), desktopIp: row.desktopIp } });
}

export type HandoffClaim = { status: "pending" | "approved" | "expired" | "denied"; expiresAt: Date | null };

/**
 * Компьютер 2 секунд тутам дуудна. Батлагдсан бол **энэ хүсэлтийн хариулт
 * дээр** proof cookie-г мөнгөлнө — өөрөөр хэлбэл proof яг энэ хөтөч, яг энэ
 * табд үүснэ. Утас руу ямар ч proof хэзээ ч очихгүй.
 */
export async function claimFaceHandoff(input: { token: string; userId: number; sessionVersion: number; faceGrantVersion: number; req: Request; res: Response }): Promise<HandoffClaim> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Өгөгдлийн сан бэлэн биш байна." });
  const row = await loadRequest(input.token);
  if (!row || row.userId !== input.userId || row.sessionVersion !== input.sessionVersion) return { status: "expired", expiresAt: null };
  if (row.status === "pending") return { status: "pending", expiresAt: row.expiresAt };
  if (row.status !== "approved") return { status: row.status === "denied" ? "denied" : "expired", expiresAt: null };

  // Таб таарахгүй бол proof өгөхгүй: QR-ийг үүсгэсэн таб л онгойно (өөр таб
  // өөрийн QR-ээ гаргана). Табын шаардлага 2026-09-14-нд нэмэгдсэн —
  // handoff түүнийг тойрч болохгүй.
  if (row.adminTabId !== tabIdFrom(input.req)) return { status: "expired", expiresAt: null };

  const used = await db.update(faceHandoffRequests).set({ status: "used" })
    .where(and(eq(faceHandoffRequests.id, row.id), eq(faceHandoffRequests.status, "approved")));
  if (Number(used[0].affectedRows ?? 0) !== 1) return { status: "expired", expiresAt: null };

  // Handoff-оор нээгдсэн сесс богино идэвхгүй цонхтой (10 минут) —
  // shared/face-auth.ts-ийн FACE_HANDOFF_IDLE_TIMEOUT_MS.
  await issueFaceProof({ req: input.req, res: input.res, userId: input.userId, sessionVersion: input.sessionVersion, faceGrantVersion: input.faceGrantVersion, idleTimeoutMs: FACE_HANDOFF_IDLE_TIMEOUT_MS });
  return { status: "approved", expiresAt: null };
}

/** Өдөр тутмын цэвэрлэгээ (server/automation.ts-ийн retention job дуудна). */
export async function purgeExpiredFaceHandoffs(olderThanHours = 24): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const result = await db.delete(faceHandoffRequests).where(lt(faceHandoffRequests.createdAt, cutoff));
  return Number(result[0].affectedRows ?? 0);
}

/** Тухайн хэрэглэгчийн хүлээгдэж буй хүсэлтийн тоо — rate limit-ийн нэмэлт
 *  хамгаалалт биш, зөвхөн тестэд ашиглагдана. */
export async function countPendingHandoffs(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(faceHandoffRequests)
    .where(and(eq(faceHandoffRequests.userId, userId), eq(faceHandoffRequests.status, "pending")));
  return Number(row?.count ?? 0);
}
