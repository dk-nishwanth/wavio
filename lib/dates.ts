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

const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";

/**
 * Reads a stay from free text. Understands "20 dec to 23 dec", "20-23 dec", "from 20 dec for 3 nights",
 * "dec 20 - dec 23", "20/12 to 23/12", "tomorrow for 2 nights". Returns what it could find.
 */
export function parseDateRange(text: string): { check_in?: string; check_out?: string; nights?: number } {
  const t = String(text ?? "").toLowerCase();
  const out: { check_in?: string; check_out?: string; nights?: number } = {};
  const nights = t.match(/(\d{1,2})\s*(?:nights?|raat|din|days?)\b/);
  if (nights) out.nights = Math.min(60, Number(nights[1]));
  // "20-23 dec" / "20 to 23 dec" — a day range sharing one month
  const share = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to|till|until|se|–)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*${MONTH_RE}(?:\\s*,?\\s*(\\d{4}))?`));
  if (share) {
    const a = parseDate(`${share[1]} ${share[3]} ${share[4] ?? ""}`), b = parseDate(`${share[2]} ${share[3]} ${share[4] ?? ""}`);
    if (a && b) { out.check_in = a; out.check_out = b >= a ? b : addDays(b, 365); out.nights = out.nights ?? diffDays(out.check_in, out.check_out); return out; }
  }
  // every explicit date in the message, in order
  const found: string[] = [];
  const pats = [/\d{4}-\d{1,2}-\d{1,2}/g, /\b\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?\b/g, new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s*(?:of\\s*)?${MONTH_RE}(?:\\s*,?\\s*\\d{4})?`, "g"), new RegExp(`\\b${MONTH_RE}\\.?\\s*\\d{1,2}(?!\\d)(?:st|nd|rd|th)?(?:\\s*,?\\s*\\d{4})?`, "g")];
  const spans: { i: number; e: number; s: string }[] = [];
  // earlier patterns win; a later pattern may not re-read the same characters (e.g. "december 20" inside "december 2026")
  for (const re of pats) for (const m of t.matchAll(re)) { const i = m.index ?? 0, e = i + m[0].length; if (!spans.some((x) => i < x.e && e > x.i)) spans.push({ i, e, s: m[0] }); }
  spans.sort((a, b) => a.i - b.i);
  for (const sp of spans) { const d = parseDate(sp.s); if (d) found.push(d); }
  if (!found.length) {
    const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const w = t.match(/\b(today|tomorrow|aaj|kal)\b/);
    if (/\bday after tomorrow\b/.test(t)) found.push(addDays(isoToday(), 2));
    else if (w) found.push(parseDate(w[1] === "aaj" ? "today" : w[1] === "kal" ? "tomorrow" : w[1])!);
    else {
      const d = t.match(new RegExp(`\\b(?:(?:this|next|coming|on)\\s+)?(${WD.join("|")})\\b`));
      if (d) { const dow = new Date(isoToday() + "T00:00:00Z").getUTCDay(); let delta = (WD.indexOf(d[1]) - dow + 7) % 7; if (delta === 0) delta = 7; found.push(addDays(isoToday(), delta)); }
    }
  }
  if (found[0]) out.check_in = found[0];
  if (found[1]) out.check_out = found[1] > found[0] ? found[1] : addDays(found[1], 365);
  if (out.check_in && !out.check_out && out.nights) out.check_out = addDays(out.check_in, out.nights);
  if (out.check_in && out.check_out && !out.nights) out.nights = diffDays(out.check_in, out.check_out);
  return out;
}

/** "4 people", "2 adults 1 kid", "family of 5", "we are 3". Returns total guests, or null. */
export function parseGuests(text: string, bare = false): number | null {
  const t = String(text ?? "").toLowerCase();
  let total = 0, hit = false;
  for (const m of t.matchAll(/(\d{1,2})\s*(?:adults?|kids?|child(?:ren)?|infants?|people|persons?|guests?|pax|members?|log|bachche|bacche)\b/g)) { total += Number(m[1]); hit = true; }
  if (hit) return Math.min(total, 60);
  const fam = t.match(/(?:family of|group of|party of|we are|we r|hum)\s*(\d{1,2})/);
  if (fam) return Number(fam[1]);
  if (bare) { const n = t.trim().match(/^(\d{1,2})$/); if (n) return Number(n[1]); }
  return null;
}
