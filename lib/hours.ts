import { getBusiness } from "./industry";

const mins = (hhmm?: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const label = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };

/** True when the team is on duty (or no hours are set). Uses the server's local time, so run the server in the resort's time zone. */
export function teamIsOn(ws: string, at = new Date()): boolean {
  const b = getBusiness(ws), o = mins(b.hours_open), c = mins(b.hours_close);
  if (o == null || c == null) return true;
  const now = at.getHours() * 60 + at.getMinutes();
  return o <= c ? now >= o && now < c : now >= o || now < c; // overnight shifts
}

/** Added to replies that promise a human: "Our team is offline right now; they'll reply from 9:00 AM." (empty when on duty). */
export function hoursNote(ws: string, at = new Date()): string {
  if (teamIsOn(ws, at)) return "";
  const b = getBusiness(ws);
  return `\n\n🕘 Our team is offline right now and will reply from ${label(b.hours_open!)}.`;
}
