// Triggers a browser download for a base64-encoded file the server returned
// (analytics Excel/PDF exports — see admin.analyticsExport in
// server/routers.ts). Same download-via-blob-URL mechanics as
// client/src/lib/csv.ts's downloadCsv, just starting from base64 instead of
// building the text ourselves.
export function downloadBase64File(filename: string, dataBase64: string, mimeType: string) {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
