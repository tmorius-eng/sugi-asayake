// Серверийн буцаасан base64 файлыг хөтчөөр татуулна (analytics Excel/PDF export —
// server/routers.ts-ийн admin.analyticsExport). client/src/lib/csv.ts-ийн
// downloadCsv-тэй ижил blob-URL механизм, зөвхөн текст өөрсдөө бүтээхийн оронд
// base64-ээс эхэлнэ.
import { revokeObjectUrlLater } from "./csv";

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
  revokeObjectUrlLater(url);
}

/** JSON объектыг файл болгож татуулна (Брэнд студийн брэнд багц, 2026-10-05). */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  revokeObjectUrlLater(url);
}
