import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type ImageLightboxProps = {
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alt: string;
};

/**
 * Full-screen product photo viewer — click the main gallery image on
 * ProductDetail to see it large, then click again to zoom further in
 * (a fixed 1.9x scale is simpler and more robust than a cursor-following
 * magnifier, and still answers the real question a shopper has: "can I see
 * the texture/packaging closer before buying?"). Arrow keys and on-screen
 * chevrons step through the same gallery the small thumbnails already show.
 */
export default function ImageLightbox({ images, index, onIndexChange, open, onOpenChange, alt }: ImageLightboxProps) {
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => { if (!open) setZoomed(false); }, [open]);
  useEffect(() => { setZoomed(false); }, [index]);

  const goTo = (next: number) => onIndexChange((next + images.length) % images.length);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") goTo(index - 1);
      else if (event.key === "ArrowRight") goTo(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, images.length]);

  if (!images.length) return null;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="image-lightbox-dialog" showCloseButton={false}>
      <DialogTitle className="sr-only">{alt} — томруулсан харагдац</DialogTitle>
      <div className="image-lightbox-stage">
        <span className="image-lightbox-hint">ДАРАХАД ТОМРОНО · ← → ГАРААР СОЛИГДОНО</span>
        <button type="button" className="image-lightbox-close" onClick={() => onOpenChange(false)} aria-label="Хаах"><X size={18} /></button>
        {images.length > 1 && <button type="button" className="image-lightbox-nav prev" onClick={() => goTo(index - 1)} aria-label="Өмнөх зураг"><ChevronLeft size={20} /></button>}
        <img src={images[index]} alt={alt} className={zoomed ? "is-zoomed" : undefined} onClick={() => setZoomed(current => !current)} />
        {images.length > 1 && <button type="button" className="image-lightbox-nav next" onClick={() => goTo(index + 1)} aria-label="Дараах зураг"><ChevronRight size={20} /></button>}
        {images.length > 1 && <span className="image-lightbox-counter">{index + 1} / {images.length}</span>}
      </div>
    </DialogContent>
  </Dialog>;
}
