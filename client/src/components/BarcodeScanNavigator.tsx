import { useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

/**
 * Scan a product anywhere on the storefront and land on its page
 * (2026-09-11, Tom's request: "website browser deer neeltei bhad computer
 * zalgasan scanneraar baraagaa unshuulaad ter baraanii page garj irdeg").
 *
 * Mounted once in App, so the shop's counter laptop can have the site open
 * on any page, pull the trigger, and get the product -- no field to click
 * into first. See useBarcodeScanner for how a keyboard-wedge gun is told
 * apart from a person typing.
 *
 * SKIPPED ON /admin on purpose: a scan there would navigate the staff
 * member off a half-edited product or an open POS sale. The register has
 * its own scan field, which is the right place for that flow.
 */
export default function BarcodeScanNavigator() {
  const [location, navigate] = useLocation();
  const utils = trpc.useUtils();
  // Guards against the gun's double-trigger (and against a slow lookup
  // being overtaken by the next scan) -- without it, two rapid pulls fire
  // two navigations and two toasts.
  const inFlightRef = useRef(false);

  const handleScan = useCallback(async (code: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const dismiss = toast.loading(`Баркод уншлаа: ${code}`);
    try {
      const product = await utils.catalog.bySku.fetch({ sku: code });
      if (!product) {
        toast.error("Энэ баркодтой бараа сайтад алга.", { id: dismiss, description: code });
        return;
      }
      toast.success(product.name, { id: dismiss, description: "Барааны хуудас нээгдэж байна…" });
      navigate(`/product/${product.slug}`);
    } catch {
      toast.error("Баркод хайхад алдаа гарлаа. Дахин уншуулна уу.", { id: dismiss });
    } finally {
      inFlightRef.current = false;
    }
  }, [navigate, utils]);

  useBarcodeScanner(handleScan, !location.startsWith("/admin"));

  return null;
}
