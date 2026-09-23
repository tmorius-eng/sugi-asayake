// Admin панелийн client талын CSV export (TIER 5) — сервер рүү явахгүй, учир нь
// admin/захиалга/барааны жагсаалт санах ойд бүрэн ачаалагдсан байдаг.
// RFC 4180-аар escape хийнэ: таслал, хашилт, шинэ мөр агуулсан утгыг хашилтад
// хийж, доторх хашилтыг давхарлана.
// 2026-09-23: томьёоны injection. Зочны checkout-ийн нэр чөлөөт текст тул
// `=HYPERLINK("http://…?"&C2,"…")` гэх мэт нэр Excel-д нээхэд томьёо болж
// ажиллан хөрш нүднүүдийг (утас, имэйл) гадагш алддаг байв. `= + - @`, tab,
// CR-ээр эхэлсэн ТЕКСТИЙГ `'`-ээр эхлүүлнэ (OWASP CSV Injection). Тоо
// (сөрөг зөрүү гэх мэт) хөндөгдөхгүй — зөвхөн string. parseCsv буцааж хасна.
const FORMULA_START = /^[=+\-@\t\r]/;
const GUARDED_FORMULA = /^'[=+\-@\t\r]/;

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" && FORMULA_START.test(value) ? `'${value}` : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const lines = [headers, ...rows].map(row => row.map(escapeCsvCell).join(","));
  // Leading BOM so Excel (still common for opening exports in Mongolia)
  // detects UTF-8 instead of mangling Cyrillic headers/content.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  revokeObjectUrlLater(url);
}

/** Blob URL-ийг шууд биш хожим суллана (2026-09-23): Safari/хуучин Firefox
 *  `click()`-ийн дараа татаалтыг асинхрон эхлүүлдэг тул шууд revoke нь
 *  хоосон/тасалдсан файл өгдөг. pdf.ts аль хэдийн ингэж хүлээдэг. */
export function revokeObjectUrlLater(url: string) {
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Admin overhaul (2026-09-08, Phase H): bulk CSV product import's counterpart
// to downloadCsv above -- same RFC 4180 rules (quoted fields may contain
// commas/newlines, "" is an escaped quote), plus stripping a leading BOM
// (Excel, this project's own primary export target per downloadCsv's own
// comment, writes one by default when saving a .csv). A hand-rolled parser,
// not a new dependency, for a format this constrained -- CSV row/field
// splitting has no meaningful edge case a small state machine doesn't cover.
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < withoutBom.length; i++) {
    const char = withoutBom[i];
    if (inQuotes) {
      if (char === '"') {
        if (withoutBom[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === ",") { row.push(field); field = ""; continue; }
    if (char === "\r") continue;
    if (char === "\n") { row.push(field); table.push(row); row = []; field = ""; continue; }
    field += char;
  }
  // Last field/row (files don't always end with a trailing newline).
  if (field.length > 0 || row.length > 0) { row.push(field); table.push(row); }

  const [headerRow, ...dataRows] = table.filter(cells => !(cells.length === 1 && cells[0] === ""));
  const headers = (headerRow ?? []).map(header => header.trim());
  // downloadCsv-ийн томьёоны хамгаалалтын `'`-ийг буцааж хасна (экспорт → импорт давталт).
  const unguard = (value: string) => (GUARDED_FORMULA.test(value) ? value.slice(1) : value);
  const rows = dataRows.map(cells => Object.fromEntries(headers.map((header, index) => [header, unguard((cells[index] ?? "").trim())])));
  return { headers, rows };
}
