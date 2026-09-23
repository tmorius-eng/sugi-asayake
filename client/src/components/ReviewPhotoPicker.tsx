import { useRef, useState } from "react";
import { Camera, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { prepareImageUpload } from "@/lib/prepareImageUpload";

/**
 * Сэтгэгдэлд нэг зураг (2026-09-21, migration 0093).
 *
 * Сонгосон зургийг утсан дээрээ багасгаж (prepareImageUpload — 12 MB-ийн утасны
 * зураг ~1 MB болно), шууд `reviews.uploadImage` руу илгээнэ: сервер файлын
 * гарын үсэг, nudity screen, WebP/AVIF хувилбар хийж `/cdn/reviews/<хэрэглэгч>/…`
 * буцаана. Сэтгэгдэл илгээхэд тэр URL-ийг л дамжуулна (`value`).
 */
/** Серверийн хүлээн авах дээд хэмжээтэй тохирсон клиентийн тааз (2026-09-23). */
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

export default function ReviewPhotoPicker({ productId, value, onChange }: { productId: number; value: string | null; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const upload = trpc.reviews.uploadImage.useMutation({
    onSuccess: result => onChange(result.url),
    onError: error => { toast.error(error.message); setNote(null); },
  });

  // 2026-09-23: (a) try/catch — `prepareImageUpload`/`readAsDataUrl` нь
  // уншилтын алдаанд шиддэг бөгөөд дуудагч нь `void pick(...)` тул уналт
  // чимээгүй алга болж, хэрэглэгч юу ч харахгүй байв; (b) хэмжээний тааз —
  // `prepareImageUpload` нь canvas-ийн үр дүн жижиг болоогүй бол ЭХ файлыг
  // буцаадаг (PNG дээр байнга) тул 12 MB PNG нь ~16 MB base64 болж сервер
  // татгалзаж, маскалагдсан ерөнхий алдаа гардаг байв.
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      await pickInner(file);
    } catch (error) {
      setNote(null);
      toast.error(error instanceof Error ? error.message : "Зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.");
    }
  };

  const pickInner = async (file: File) => {
    const prepared = await prepareImageUpload(file);
    if (!ACCEPT.split(",").includes(prepared.file.type)) { toast.error("JPG, PNG эсвэл WebP зураг сонгоно уу."); return; }
    if (prepared.file.size > MAX_UPLOAD_BYTES) {
      toast.error(`Зураг хэт том байна (${Math.round(prepared.file.size / 1024 / 1024)} МБ). ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ-аас бага зураг сонгоно уу.`);
      return;
    }
    setNote(prepared.note);
    upload.mutate({ productId, fileName: prepared.file.name, contentType: prepared.file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: await readAsDataUrl(prepared.file) });
  };

  return (
    <div className="review-photo-picker">
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={event => { void pick(event.target.files?.[0]); event.target.value = ""; }} />
      {value ? (
        <div className="review-photo-preview">
          <img src={value} alt="Сэтгэгдэлд хавсаргах зураг" />
          <button type="button" onClick={() => onChange(null)} aria-label="Зургийг хасах"><X size={14} aria-hidden="true" /></button>
        </div>
      ) : (
        <button type="button" className="review-photo-add" onClick={() => input.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? <LoaderCircle className="animate-spin" size={15} aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />}
          {upload.isPending ? "Зураг шалгаж байна…" : "Зураг нэмэх (заавал биш)"}
        </button>
      )}
      {note && upload.isPending ? <p className="review-photo-note">{note}</p> : null}
    </div>
  );
}
