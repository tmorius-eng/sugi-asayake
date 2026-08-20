// Client-side CSV export for the admin panel (TIER 5) — no server round trip,
// since the admin/orders/products lists are already fully loaded in memory.
// Escapes per RFC 4180: wrap in quotes if the value contains a comma, quote,
// or newline; double up any embedded quotes.
function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
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
  URL.revokeObjectURL(url);
}
