import { useCallback, useRef, useState } from "react";
import { newRequestId } from "@/lib/requestId";
import { LoaderCircle, Minus, Plus, ScanBarcode, Search, ShoppingBag, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";
import { formatVariantAttributes } from "@shared/catalog-filter";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { normaliseBarcode } from "@shared/barcode";

// "Controls everything" admin overhaul (2026-09-08, Phase M): the POS
// in-person-sale tool -- records a REAL order (paymentStatus "paid"
// immediately, no separate confirmation step) and decrements the exact
// branch's real stock, going forward superseding the need for the old
// `loyaltyManualAdjustmentMnt` bridge (a single lump-sum number with no
// line items/SKUs/stock effect) for NEW in-store purchases -- that bridge
// stays untouched for existing/historical data. No manual price override
// in v1: always the variant's real, current price.
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

type LineItem = { variantId: number; productName: string; sku: string; attributesJson: string | null; priceMnt: number; quantity: number };

export default function AdminPosPanel() {
  const branchesQuery = trpc.content.branches.useQuery();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lastReceipt, setLastReceipt] = useState<{ orderNumber: string; totalMnt: number } | null>(null);

  const searchQuery = trpc.admin.posSearchVariants.useQuery({ branchId: branchId ?? 0, search }, { enabled: branchId !== null });
  const recordSale = trpc.admin.recordInStoreSale.useMutation();
  // One key per basket: a resend after a timeout, or a double tap on
  // "Бүртгэх", comes back with the same sale instead of a second one.
  //
  // 2026-09-23: сагс ӨӨРЧЛӨГДӨХӨД түлхүүр шинэчлэгдэнэ. Түлхүүр зөвхөн
  // амжилттай болоход эргэдэг байсан тул: эхний илгээлт бодитоор бичигдээд
  // хариу нь алдагдвал сагс дэлгэцэнд үлдэнэ → кассчин сагсаа засаад дахин
  // илгээхэд сервер ижил түлхүүрээр ХУУЧИН борлуулалтыг буцааж, шинэ сагс
  // бүртгэгдээгүй атал дэлгэц "амжилттай" гэж харуулдаг байв.
  const saleRequestIdRef = useRef(newRequestId());
  const utils = trpc.useUtils();

  // Сагс/салбар өөрчлөгдвөл өөр борлуулалт — өөр idempotency түлхүүр.
  // 2026-09-27 (F-pos): нэр/утас ЭНЭ гарын үсэгт ороогүй байсан тул ижил
  // сагсанд зөвхөн харилцагчийн мэдээллийг засаад дарвал сервер хуучин
  // (өмнөх нэртэй) борлуулалтыг буцааж, шинэ засвар бичигдээгүй "амжилттай"
  // гэж харагддаг байв.
  const basketSignature = `${branchId ?? "none"}|${lineItems.map(item => `${item.variantId}x${item.quantity}`).join(",")}|${customerName.trim()}|${customerPhone.trim()}`;
  const lastBasketSignatureRef = useRef(basketSignature);
  if (lastBasketSignatureRef.current !== basketSignature) {
    lastBasketSignatureRef.current = basketSignature;
    saleRequestIdRef.current = newRequestId();
  }

  const branches = branchesQuery.data ?? [];
  const results = searchQuery.data ?? [];
  const subtotalMnt = lineItems.reduce((sum, item) => sum + item.priceMnt * item.quantity, 0);

  const addItem = useCallback((variant: (typeof results)[number]) => {
    setLineItems(current => {
      const existing = current.find(item => item.variantId === variant.variantId);
      if (existing) return current.map(item => item.variantId === variant.variantId ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { variantId: variant.variantId, productName: variant.productName, sku: variant.sku, attributesJson: variant.attributesJson, priceMnt: variant.priceMnt, quantity: 1 }];
    });
  }, []);
  // Barcode scanning at the register (2026-09-11). The storefront's global
  // scan-to-navigate listener deliberately stands down inside /admin (it
  // would yank the cashier off a half-rung sale), so the register opts in
  // here with the behaviour that actually belongs at a till: the scanned
  // item goes straight onto the receipt.
  //
  // Reuses posSearchVariants rather than adding a second lookup endpoint --
  // it already matches SKU, and since product_variants.sku is UNIQUE the
  // exact-match filter below can only ever select the one right row.
  const handleScan = useCallback(async (code: string) => {
    if (!branchId) { toast.error("Эхлээд салбараа сонгоно уу."); return; }
    try {
      const matches = await utils.admin.posSearchVariants.fetch({ branchId, search: code });
      // 2026-09-27 (F-pos): comparing the raw scanned code against row.sku
      // verbatim missed anything the scanner/keyboard-wedge normalises
      // differently (leading zeros, case, whitespace) -- normalise both
      // sides the same way checkout/lookups do elsewhere.
      const scanned = normaliseBarcode(code);
      const variant = matches.find(row => normaliseBarcode(row.sku) === scanned);
      if (!variant) { toast.error("Энэ баркодтой бараа олдсонгүй.", { description: code }); return; }
      addItem(variant);
      // Stock is enforced for real by the server when the sale is recorded;
      // this is an early warning so the cashier finds out at the scan, not
      // at the end of a full basket.
      if (variant.stockAtBranch <= 0) toast.warning(`${variant.productName} — энэ салбарт үлдэгдэлгүй байна.`);
      else toast.success(variant.productName, { description: `${formatMnt(variant.priceMnt)} · нэмэгдлээ` });
    } catch {
      toast.error("Баркод хайхад алдаа гарлаа. Дахин уншуулна уу.");
    }
  }, [branchId, utils, addItem]);

  useBarcodeScanner(handleScan, branchId !== null);

  const changeQuantity = (variantId: number, delta: number) => {
    setLineItems(current => current.map(item => item.variantId === variantId ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item).filter(item => item.quantity > 0));
  };
  const removeItem = (variantId: number) => setLineItems(current => current.filter(item => item.variantId !== variantId));

  const submit = async () => {
    if (!branchId) { toast.error("Салбар сонгоно уу."); return; }
    if (!lineItems.length) { toast.error("Дор хаяж нэг бараа нэмнэ үү."); return; }
    try {
      const order = await recordSale.mutateAsync({
        branchId,
        items: lineItems.map(item => ({ variantId: item.variantId, quantity: item.quantity })),
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        clientRequestId: saleRequestIdRef.current,
      });
      saleRequestIdRef.current = newRequestId();
      setLastReceipt({ orderNumber: order.orderNumber, totalMnt: order.totalMnt });
      toast.success(`Худалдаа бүртгэгдлээ — ${order.orderNumber}`);
      setLineItems([]);
      setCustomerName("");
      setCustomerPhone("");
      setSearch("");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div>
        {/* 2026-09-12 audit: since Tom's decision that the shops ring up every
            sale in Smart POS (and its stock is pulled back as a stocktake),
            a sale entered here for a store branch is counted twice -- once
            here, once in Smart POS -- and the next stock pull would then
            propose "correcting" it away. The tool stays for locations
            without a register; the screen has to say so. */}
        <p className="mb-4 rounded-2xl bg-[var(--a-warn-soft)] p-3 text-[11px] leading-4 text-[var(--a-warn)]">
          <strong>Дэлгүүрүүд Smart POS-оор зардаг.</strong> Дэлгүүрийн салбарт энд бүртгэсэн борлуулалт Smart POS-тэй давхардаж, дараагийн үлдэгдэл татахад зөрүү болж гарна. Энэ хэрэгслийг зөвхөн кассгүй байршилд (агуулах, түр цэг) ашиглана уу.
        </p>
        <label className="grid gap-1.5 text-xs font-bold">
          <span className="flex items-center gap-1.5"><Store size={13} />Салбар</span>
          <select value={branchId ?? ""} onChange={event => { setBranchId(event.target.value ? Number(event.target.value) : null); setLineItems([]); }} className="h-11 w-full max-w-sm rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]">
            <option value="">Салбар сонгох</option>
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>

        {branchId && <>
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--a-soft)] px-3 py-2.5 text-[11px] text-[var(--a-muted)]">
            <ScanBarcode size={14} className="shrink-0" />
            <span>Баркод уншуулахад бараа шууд худалдаанд нэмэгдэнэ — хайлтын талбар дээр дарах шаардлагагүй.</span>
          </p>

          <label className="mt-3 grid gap-1.5 text-xs font-bold">
            <span className="flex items-center gap-1.5"><Search size={13} />Бараа хайх (нэр эсвэл SKU)</span>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Жишээ: Shampoo эсвэл SKU" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" />
          </label>

          <div className="mt-3 grid gap-1.5">
            {searchQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>}
            {!searchQuery.isLoading && results.length === 0 && <p className="rounded-xl bg-[var(--a-soft)] px-4 py-6 text-center text-xs text-[var(--a-faint)]">{search.trim() ? "Илэрц алга." : "Хайлт бичиж бараа нэмнэ үү."}</p>}
            {results.map(variant => (
              <div key={variant.variantId} className="flex items-center gap-3 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-2.5">
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-xs">{variant.productName}</strong>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--a-muted)]">{variant.sku}{formatVariantAttributes(variant.attributesJson) ? ` · ${formatVariantAttributes(variant.attributesJson)}` : ""} · Энэ салбарт: {variant.stockAtBranch} ш</span>
                </div>
                <span className="shrink-0 text-xs font-bold">{formatMnt(variant.priceMnt)}</span>
                <button type="button" onClick={() => addItem(variant)} className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#df1f3d] px-3 py-1.5 text-[10px] font-extrabold text-white hover:bg-[#bc1732]"><Plus size={11} />Нэмэх</button>
              </div>
            ))}
          </div>
        </>}
      </div>

      <aside className="h-fit rounded-3xl bg-[var(--a-btn-dark)] p-5 text-white">
        <div className="flex items-center gap-2 text-[#f0b52d]"><ShoppingBag size={16} /><span className="text-[10px] font-extrabold tracking-[.14em]">ДЭЛГҮҮРИЙН ХУДАЛДАА</span></div>

        {!lineItems.length ? <p className="mt-4 rounded-xl border border-dashed border-white/25 p-4 text-center text-xs text-white/60">Бараа сонгоогүй байна.</p> : (
          <div className="mt-4 grid gap-2">
            {lineItems.map(item => (
              <div key={item.variantId} className="flex items-center gap-2 rounded-xl bg-white/10 p-2.5">
                <div className="min-w-0 flex-1"><strong className="block truncate text-xs">{item.productName}</strong><span className="mt-0.5 block text-[10px] text-white/50">{formatMnt(item.priceMnt)}</span></div>
                {/* 2026-09-27 (F-pos): editing the basket while the sale is
                    in flight rotates saleRequestIdRef -- since that rotation
                    only reacts to the basket AFTER this render, an edit made
                    mid-submit could land between the request being built and
                    the key changing, letting a second click send stale data
                    under a fresh key. Simplest fix: disable editing while pending. */}
                <button type="button" disabled={recordSale.isPending} onClick={() => changeQuantity(item.variantId, -1)} className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40" aria-label="Тоо хасах"><Minus size={11} /></button>
                <span className="w-5 shrink-0 text-center text-xs font-bold">{item.quantity}</span>
                <button type="button" disabled={recordSale.isPending} onClick={() => changeQuantity(item.variantId, 1)} className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40" aria-label="Тоо нэмэх"><Plus size={11} /></button>
                <button type="button" disabled={recordSale.isPending} onClick={() => removeItem(item.variantId)} className="shrink-0 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-[#df1f3d] disabled:opacity-40" aria-label="Хасах"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 grid gap-2">
          <input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Худалдан авагчийн нэр (сонголтоор)" className="h-10 rounded-lg border border-white/20 bg-white/10 px-3 text-xs text-white outline-none placeholder:text-white/40 focus:border-[#f0b52d]" />
          <input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="Утас (сонголтоор)" className="h-10 rounded-lg border border-white/20 bg-white/10 px-3 text-xs text-white outline-none placeholder:text-white/40 focus:border-[#f0b52d]" />
        </div>

        <div className="mt-4 flex justify-between border-t border-white/12 pt-4 text-lg font-bold"><span>Нийт</span><span>{formatMnt(subtotalMnt)}</span></div>

        <button type="button" disabled={!branchId || !lineItems.length || recordSale.isPending} onClick={submit} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#f0b52d] px-5 text-sm font-bold text-[#16181c] disabled:cursor-not-allowed disabled:opacity-50">
          {recordSale.isPending ? <LoaderCircle className="animate-spin" size={16} /> : "Худалдаа баталгаажуулах"}
        </button>

        {lastReceipt && <p className="mt-3 rounded-xl bg-[#286b4c] px-3 py-2 text-center text-xs font-bold">Сүүлд бүртгэсэн: #{lastReceipt.orderNumber} — {formatMnt(lastReceipt.totalMnt)}</p>}
      </aside>
    </div>
  );
}
