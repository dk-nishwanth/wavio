/** CSV for Excel/Sheets. Cells starting with = + - @ are neutralised so a guest can't plant a spreadsheet formula in their name. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  const looksLikePhone = /^\+\d[\d ()-]{6,}$/.test(s);                       // "+919876543210" is data, not a formula
  if (/^[=+\-@\t\r]/.test(s) && !looksLikePhone) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (headers: string[], rows: unknown[][]) => "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
