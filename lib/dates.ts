// Dates are handled as YYYY-MM-DD strings in the business's local time.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
export const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const utc = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const addDays = (s: string, n: number) => new Date(utc(s).getTime() + n * 864e5).toISOString().slice(0, 10);
export const diffDays = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 864e5);
export const pretty = (s: string) => { const d = utc(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()][0].toUpperCase()}${MONTHS[d.getUTCMonth()].slice(1)} ${d.getUTCFullYear()}`; };
/** Local-time epoch ms for a date and hour of day. */
export const atLocal = (iso: string, hour: number) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, hour, 0, 0).getTime(); };

/** Understands "2026-12-20", "20/12/2026", "20 dec", "dec 20 2026", "tomorrow". Dates already past roll to next year. */
export function parseDate(text: string): string | null {
  const t = String(text ?? "").trim().toLowerCase();
  const today = isoToday();
  if (t === "today") return today;
  if (t === "tomorrow") return addDays(today, 1);
  let y: number | undefined, m: number | undefined, d: number | undefined, x: RegExpMatchArray | null;
  if ((x = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = t.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/))) { d = +x[1]; m = +x[2]; y = x[3] ? (+x[3] < 100 ? 2000 + +x[3] : +x[3]) : undefined; }
  else if ((x = t.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s*)?([a-z]{3})[a-z]*\.?(?:,?\s*(\d{4}))?/)) && MONTHS.includes(x[2])) { d = +x[1]; m = MONTHS.indexOf(x[2]) + 1; y = x[3] ? +x[3] : undefined; }
  else if ((x = t.match(/([a-z]{3})[a-z]*\.?\s*(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/)) && MONTHS.includes(x[1])) { d = +x[2]; m = MONTHS.indexOf(x[1]) + 1; y = x[3] ? +x[3] : undefined; }
  if (!d || !m || m > 12 || d > 31) return null;
  const year = y ?? new Date().getFullYear();
  let iso = `${year}-${pad(m)}-${pad(d)}`;
  if (isNaN(utc(iso).getTime())) return null;
  if (!y && iso < today) iso = `${year + 1}-${iso.slice(5)}`;
  return iso;
}
