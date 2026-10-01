import { TRPCError } from "@trpc/server";
import { PIXEL_LIMIT_MESSAGE, isPixelLimitError, processUploadedImage } from "./imageProcessing";

/**
 * Image upload validation shared by every tRPC upload endpoint (2026-09-11:
 * moved out of server/routers.ts so server/inventoryRouter.ts can accept a
 * supplier-invoice photo without importing the whole app router).
 */

export const imageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageContentType = (typeof imageContentTypes)[number];

/**
 * Зургийн сан / контентын upload-ууд (бараа, site media, нийтлэл, медиа
 * сан) нэмж GIF хүлээн авна (2026-09-21) — хөдөлгөөнт GIF нь хөдөлгөөнтэйгээ
 * animated WebP болж хадгалагдана (imageProcessing.ts). Нийлүүлэгчийн
 * нэхэмжлэхийн зураг (inventoryRouter) нь imageContentTypes-оор хэвээр.
 */
export const mediaContentTypes = [...imageContentTypes, "image/gif"] as const;
export type MediaContentType = (typeof mediaContentTypes)[number];

export function assertImageSignature(buffer: Buffer, contentType: ImageContentType | MediaContentType) {
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const isGif = buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  const matches = (contentType === "image/jpeg" && isJpeg) || (contentType === "image/png" && isPng) || (contentType === "image/webp" && isWebp) || (contentType === "image/gif" && isGif);

  if (!matches) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The file content does not match the selected image type." });
  }
}

// assertImageSignature above only checks the first few magic bytes, which a
// truncated/otherwise-corrupt upload can still satisfy; sharp's actual
// decode (inside processUploadedImage) is the real validity check. Wrapping
// it here turns a raw decoder exception into a clean, translated
// BAD_REQUEST instead of leaking an internal stack trace to the client.
export async function processUploadedImageOrThrow(buffer: Buffer, contentType: ImageContentType, maxDimension: number): Promise<Buffer> {
  try {
    return await processUploadedImage(buffer, contentType, maxDimension);
  } catch (error) {
    if (isPixelLimitError(error)) throw new TRPCError({ code: "BAD_REQUEST", message: PIXEL_LIMIT_MESSAGE });
    throw new TRPCError({ code: "BAD_REQUEST", message: "Зургийг уншиж чадсангүй. Файл гэмтсэн эсвэл дэмжигдээгүй байж магадгүй." });
  }
}

/** Accepts either raw base64 or a data: URL, as the admin upload fields send. */
export function decodeBase64Upload(dataBase64: string): Buffer {
  const raw = dataBase64.includes(",") ? dataBase64.slice(dataBase64.indexOf(",") + 1) : dataBase64;
  return Buffer.from(raw, "base64");
}
