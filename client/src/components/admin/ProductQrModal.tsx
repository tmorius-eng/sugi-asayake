import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, LoaderCircle, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Барааны QR код — тавиурын шошго, каталог, сурталчилгааны хуудсанд (2026-09-14).
 *
 * Хуучин asayake.mn (Zochil)-ийн барааны жагсаалтад "QR КОД ҮҮСГЭХ" багана байсныг
 * нөхөв. Код нь тухайн барааны ОЛОН НИЙТИЙН хуудас руу заана (`/product/<slug>`) —
 * баркод (JAN) руу биш: баркодыг уншуулбал утасны камер зүгээр нэг тоо харуулна,
 * харин линк уншуулбал үнэ, найрлага, хэмжээ, сэтгэгдэл бүхий бодит хуудас нээгдэнэ.
 *
 * Гарал үүсэл нь `window.location.origin` — admin болон storefront нэг origin дээр
 * үйлчилдэг тул тогтмол бичсэн домэйн (staging дээр буруу QR үүсгэх эх үүсвэр)
 * хэрэггүй.
 *
 * Зөвхөн хөтөч дээр ажиллана: сервер рүү хүсэлт явуулахгүй, зураг хадгалахгүй.
 */
export type QrProduct = { name: string; slug: string; sku: string };

export default function ProductQrModal({ product, onClose }: { product: QrProduct | null; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = product ? `${window.location.origin}/product/${product.slug}` : "";

  useEffect(() => {
    if (!product) { setDataUrl(null); return; }
    let cancelled = false;
    // 720px: A4 дээр 4-6 см-ийн шошго болгож хэвлэхэд хангалттай нягтрал.
    QRCode.toDataURL(url, { margin: 1, width: 720, errorCorrectionLevel: "M" })
      .then(generated => { if (!cancelled) setDataUrl(generated); })
      .catch(() => { if (!cancelled) setDataUrl(null); });
    return () => { cancelled = true; };
  }, [product, url]);

  /**
   * Хэвлэх нь админ панелийг биш, зөвхөн шошгыг цаасан дээр гаргах ёстой тул
   * тусдаа цонхонд бичиж хэвлэнэ (панелийн өөрийн CSS, sidebar хамаарахгүй).
   */
  const print = () => {
    if (!product || !dataUrl) return;
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win) return;
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    win.document.write(`<!doctype html><html lang="mn"><head><meta charset="utf-8"><title>${escape(product.name)}</title>
      <style>
        body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; }
        .label { width: 260px; text-align: center; padding: 16px; }
        img { width: 200px; height: 200px; }
        h1 { font-size: 13px; line-height: 1.35; margin: 10px 0 4px; }
        p { font-size: 11px; color: #555; margin: 0; }
        @media print { body { min-height: auto; } }
      </style></head><body><div class="label">
        <img src="${dataUrl}" alt="">
        <h1>${escape(product.name)}</h1>
        <p>${escape(product.sku)}</p>
      </div><script>window.onload = function () { window.print(); };</script></body></html>`);
    win.document.close();
  };

  return (
    <Dialog open={product !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogTitle>QR код</DialogTitle>
        <DialogDescription>Уншуулбал энэ барааны хуудас утсан дээр нээгдэнэ. Тавиурын шошго, сурталчилгааны хуудсанд ашиглана.</DialogDescription>
        {product && (
          <div className="mt-2 grid gap-4">
            <div className="mx-auto grid size-[220px] place-items-center rounded-2xl bg-white p-2 shadow-sm">
              {dataUrl ? <img src={dataUrl} alt={`${product.name} — QR код`} className="size-full" /> : <LoaderCircle className="animate-spin text-[#8a8f98]" size={20} />}
            </div>
            <div className="text-center">
              <p className="text-[13px] font-bold text-[var(--a-ink)]">{product.name}</p>
              <p className="mt-0.5 text-[11px] text-[var(--a-muted)]">Баркод: {product.sku}</p>
              <p className="mt-1 break-all text-[11px] text-[var(--a-muted)]">{url}</p>
            </div>
            <div className="flex justify-center gap-2">
              <a
                href={dataUrl ?? "#"}
                download={`${product.sku || product.slug}-qr.png`}
                aria-disabled={!dataUrl}
                className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] px-4 py-2 text-[12px] font-bold transition hover:bg-[var(--a-soft)] ${dataUrl ? "" : "pointer-events-none opacity-50"}`}
              ><Download size={14} />PNG татах</a>
              <button type="button" onClick={print} disabled={!dataUrl} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] px-4 py-2 text-[12px] font-bold transition hover:bg-[var(--a-soft)] disabled:opacity-50"><Printer size={14} />Хэвлэх</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
