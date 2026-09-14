/** Saves a base64 PDF the server rendered (orders.invoicePdf, admin.packingSlipPdf) as a download. */
export function savePdfBase64(fileName: string, base64: string): void {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url; link.download = fileName; link.rel = "noopener";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
