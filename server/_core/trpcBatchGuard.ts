import type { RequestHandler } from "express";

/**
 * Cloudflare Access /api/trpc/admin* ба /api/trpc/inventory* замыг хамгаалдаг. tRPC-ийн batch
 * хүсэлт нь `/api/trpc/<proc1>,<proc2>` хэлбэртэй тул ЭХНИЙ процедур нь нийтийнх
 * (`catalog.list,admin.users`) байвал Access-ийн дүрэм таарахгүй, харин сервер бүх процедурыг
 * ажиллуулна (2026-10-01 аудит). Тиймээс admin./inventory. процедур нь бусадтай ХОЛИГДСОН
 * batch-ийг 400-аар татгалзана — клиент нь тэдгээрийг тусдаа batch-аар явуулдаг
 * (client/src/main.tsx splitLink).
 */
const PRIVILEGED_PREFIXES = ["admin.", "inventory."];

export function isPrivilegedProcedure(path: string): boolean {
  return PRIVILEGED_PREFIXES.some(prefix => path.startsWith(prefix));
}

function decodePath(rawPath: string) {
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath; // буруу кодчилол — түүхий хэлбэрээр нь шалгана
  }
}

/**
 * tRPC-ийн express adapter процедурын нэрийг СҮҮЛИЙН `/`-ийн дараах хэсгээс авдаг тул
 * `/api/trpc/x/admin.users` нь `admin.users`-ийг ажиллуулж, Access-ийн `/api/trpc/admin*`
 * дүрмийг тойрдог (2026-10-01 шалгалт). Жинхэнэ tRPC зам дотроо `/` агуулдаггүй.
 */
export function hasExtraPathSegment(rawPath: string): boolean {
  // Эхний `/`-ийг НЭГ л удаа хасна: `//admin.users` ч Access-ийн дүрэмд таарахгүй.
  return decodePath(rawPath).replace(/^\//, "").includes("/");
}

/** `rawPath`: `/api/trpc`-ийн дараах хэсэг (эхний `/`-тэй эсвэл угүй), URL-кодчилсон байж болно. */
export function isMixedPrivilegedBatch(rawPath: string): boolean {
  const procedures = decodePath(rawPath).replace(/^\/+/, "").split(",").map(part => part.trim()).filter(Boolean);
  if (procedures.length < 2) return false;
  const privileged = procedures.filter(isPrivilegedProcedure).length;
  return privileged > 0 && privileged < procedures.length;
}

export const trpcBatchGuard: RequestHandler = (req, res, next) => {
  // `app.use("/api/trpc", …)`-д req.path нь угтваргүй (`/a.b,c.d`).
  if (hasExtraPathSegment(req.path)) {
    res.status(404).json({ error: "Олдсонгүй." });
    return;
  }
  if (isMixedPrivilegedBatch(req.path)) {
    res.status(400).json({ error: "Админ болон нийтийн дуудлагыг нэг batch-д холихыг хориглоно." });
    return;
  }
  next();
};
