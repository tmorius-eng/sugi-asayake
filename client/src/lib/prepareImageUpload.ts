/**
 * Зургийг ХӨТӨЧ ДЭЭР нь жижгэрүүлээд илгээнэ (2026-09-21, admin-ий зургийн
 * framework).
 *
 * Яагаад: утасны зураг 4000px, 5–15 MB байдаг. Өмнө нь admin 8 MB-аас том
 * зургийг огт оруулж чаддаггүй ("8 MB-аас бага зураг сонгоно уу"), жижиг нь
 * ч гэсэн утасны сүлжээгээр бүтэн MB-аар явж, сервер 1600–1920px болгож
 * багасгадаг байв. Одоо 2560px-ээс том эсвэл 2 MB-аас том зургийг илгээхээс
 * ӨМНӨ багасгана — хурдан, 8 MB-ийн хязгаарт бараг хэзээ ч хүрэхгүй.
 * Серверийн sharp pipeline (server/_core/imageProcessing.ts) хэвээр эцсийн
 * формат (WebP/AVIF, хэмжээ) шийднэ — энэ нь зөвхөн тээвэрлэлтийг хөнгөлнө.
 *
 * ⚠️ Safari canvas-аас WebP ҮҮСГЭЖ ЧАДДАГГҮЙ: `toBlob("image/webp")` нь
 * чимээгүйхэн PNG буцаадаг. Tom iPhone-оос admin хийдэг тул буцаж ирсэн
 * blob-ийн төрлийг шалгаж, WebP биш бол тунгалаг бус зурагт JPEG ашиглана.
 *
 * GIF-г хөндөхгүй: canvas хөдөлгөөнийг эхний кадр болгож устгана. Сервер
 * түүнийг animated WebP болгоно.
 */

export const IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export type UploadImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
const UPLOADABLE = new Set<string>(IMAGE_UPLOAD_ACCEPT.split(","));
export const isUploadableImageType = (type: string): type is UploadImageType => UPLOADABLE.has(type);

/** Сервер 8 MB-аас том хүлээж авахгүй (routers.ts upload endpoint-ууд). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Серверийн хамгийн том хадгалах хэмжээ 1920px — 2560 нь түүнээс дээш зай. */
const CLIENT_MAX_EDGE = 2560;
const SHRINK_ABOVE_BYTES = 2 * 1024 * 1024;

export type TargetShape = { aspect: number; label: string };
/** Нүүрний hero хавтан: дөрвөлжин (`.hero-rail-slide img { aspect-ratio: 1 }`). */
export const HERO_SHAPE: TargetShape = { aspect: 1, label: "дөрвөлжин (1:1)" };
/** Бараа: /shop карт дөрвөлжин, барааны хуудас 4:5 босоо — хоёулаа тайралтгүй
 *  таарах голч 0.9, ±25% (≈ 4:5-аас 1:1-ээс жаахан өргөн хүртэл). */
export const PRODUCT_SHAPE: TargetShape = { aspect: 0.9, label: "дөрвөлжин эсвэл 4:5 босоо" };
/** Нийтлэл: хуудас 16:9, жагсаалт 4:3 — голч ~1.55. */
export const COVER_SHAPE: TargetShape = { aspect: 1.55, label: "хэвтээ 16:9" };
/** Урамшууллын попап: 4:5 босоо (SitePromo.tsx). */
export const PROMO_SHAPE: TargetShape = { aspect: 0.8, label: "босоо 4:5" };
export type PreparedImage = {
  file: File;
  /** "12.4 MB → 0.9 MB" — хэрэглэгчид харуулах, өөрчлөгдөөгүй бол null. */
  note: string | null;
  /** Хэлбэр таарахгүй бол тайрагдах тухай сануулга. */
  warning: string | null;
};

const mb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function shapeWarning(width: number, height: number, target?: TargetShape): string | null {
  if (!target || !width || !height) return null;
  const off = (width / height) / target.aspect;
  if (off > 0.8 && off < 1.25) return null;
  return `Энэ зураг ${width}×${height} (${off > 1 ? "өргөн" : "өндөр"}) — энэ хэсэг ${target.label} хэлбэрээр харуулдаг тул ${off > 1 ? "хоёр хажуу" : "дээд, доод"} хэсэг нь тайрагдана.`;
}

export async function prepareImageUpload(file: File, target?: TargetShape): Promise<PreparedImage> {
  if (!isUploadableImageType(file.type)) return { file, note: null, warning: null };
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") return { file, note: null, warning: null };

  let bitmap: ImageBitmap;
  try {
    // Орчин үеийн хөтөч EXIF эргэлтийг автоматаар хэрэглэдэг — утасны босоо
    // зураг хэвтээ болохгүй.
    bitmap = await createImageBitmap(file);
  } catch {
    // Хөтөч уншиж чадсангүй — өөрчлөлтгүй илгээж, серверийн шалгалтад үлдээнэ.
    return { file, note: null, warning: null };
  }
  const { width, height } = bitmap;
  const warning = shapeWarning(width, height, target);
  const longest = Math.max(width, height);
  if (longest <= CLIENT_MAX_EDGE && file.size <= SHRINK_ABOVE_BYTES) {
    bitmap.close();
    return { file, note: null, warning };
  }

  const scale = Math.min(1, CLIENT_MAX_EDGE / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); return { file, note: null, warning }; }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await toBlob(canvas, "image/webp", 0.9);
  if (!blob || blob.type !== "image/webp") {
    // Safari: WebP кодлогч байхгүй. PNG (тунгалаг байж болно) нь PNG-ээрээ,
    // бусад нь JPEG — тунгалаг бус зурагт хамгийн жижиг найдвартай формат.
    blob = file.type === "image/png" ? await toBlob(canvas, "image/png") : await toBlob(canvas, "image/jpeg", 0.9);
  }
  if (!blob || blob.size >= file.size) return { file, note: null, warning };

  const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  const name = `${file.name.replace(/\.[^.]+$/, "") || "image"}.${extension}`;
  const resized = scale < 1 ? ` (${width}×${height} → ${canvas.width}×${canvas.height})` : "";
  return {
    file: new File([blob], name, { type: blob.type }),
    note: `${mb(file.size)} → ${mb(blob.size)}${resized}`,
    warning,
  };
}
