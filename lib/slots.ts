// Reads the details of a stay out of a guest's message: who is coming, how many rooms, which dates, how long.
// Works on text that has already been cleaned by fuzzy.normalizeMessage ("2 adlts n 1 kid" → "2 adults and 1 kids").
import { addDays, diffDays, isoToday, parseDateRange } from "./dates";

export type Party = { total?: number; adults?: number; kids?: number };
export type StaySlots = { check_in?: string; check_out?: string; nights?: number; guests?: number; adults?: number; kids?: number; rooms?: number; notes: string[] };

const REL = "wife|husband|spouse|partner|gf|bf|girlfriend|boyfriend|fiance|fiancee|mom|mother|dad|father|parents|son|daughter|brother|sister|friend|friends|colleague|colleagues|cousin|cousins|relatives|in laws|inlaws|grandparents|grandma|grandpa|uncle|aunt|nephew|niece";
const num = (s: string | undefined) => (s ? Number(s) : undefined);

/** "2 adults and 2 kids" → 4; "family of 4 with 2 kids" → 4 (kids are inside the 4); "me, my wife and 2 kids" → 4; "2 couples" → 4. */
export function parseParty(clean: string, bare = false): Party {
  const t = clean.toLowerCase();
  let adults = 0, kids = 0, adultsSeen = false, kidsSeen = false;
  for (const m of t.matchAll(/(\d{1,2})\s*(?:adults?|grown ?ups|elders?|seniors?|men|women|ladies|gents)\b/g)) { adults += Number(m[1]); adultsSeen = true; }
  for (const m of t.matchAll(/(\d{1,2})\s*(?:kids?|children|child|infants?|babies|baby|toddlers?|bachhe|bacche|bacha|bachcha|bachha|baccha|boys?|girls?)\b/g)) { kids += Number(m[1]); kidsSeen = true; }
  for (const m of t.matchAll(/(\d{1,2})\s*couples?\b/g)) { adults += 2 * Number(m[1]); adultsSeen = true; }
  // an explicit total ("family of 4", "we are 5", "5 people") includes everyone, kids too
  const totalRe = [/\b(?:family|group|party|team|gang)\s*(?:of|size)?\s*(\d{1,2})\b/, /\b(?:we are|we r|were|there are|total|hum)\s*(\d{1,2})\b/, /\b(\d{1,2})\s*(?:of us|people|persons?|guests?|pax|members?|log|heads|travellers|travelers|persons)\b/, /\bfor\s*(\d{1,2})\s*(?:people|persons?|guests?|pax|adults)\b/, /\b(?:guests?|people|persons?|members?|pax|head ?count)\s*(?:to|=|:|are|is|will be)?\s*(\d{1,2})\b/];
  let total: number | undefined;
  for (const re of totalRe) { const m = re.exec(t); if (m) { total = Number(m[1]); break; } }
  const partsTotal = adults + kids;
  // "4 people" next to "2 kids" means the 4 includes the 2; "2 adults 2 kids" has no separate total
  if (total === undefined || (adultsSeen && total === adults)) {
    if (partsTotal && !(!adultsSeen && /\b(me|my|myself|i|mai|main)\b/.test(t))) total = partsTotal;
  }
  if (total === undefined) {
    // "me and my wife", "me, my wife and 2 kids", "me and 3 friends"
    const me = /\b(me|i|myself|mai|main)\b/.test(t) || /\b(gf|bf|girlfriend|boyfriend|wife|husband|partner|spouse)\b/.test(t) && /\b(sath|saath|with)\b/.test(t);
    if (me && /\b(gf|bf|girlfriend|boyfriend|wife|husband|partner|spouse)\b/.test(t) && !/\bmy\s+(?:wife|husband|gf|bf|partner)/.test(t)) { /* "gf ke sath" = me + partner */ }
    let n = me ? 1 : 0, found = false;
    for (const m of t.matchAll(new RegExp(`(\\d{1,2})\\s*(?:${REL})\\b`, "g"))) { n += Number(m[1]); found = true; }
    for (const m of t.matchAll(new RegExp(`\\bmy\\s+(?:${REL})\\b`, "g"))) { const w = m[0]; n += /parents|in laws|inlaws|grandparents/.test(w) ? 2 : /friends|colleagues|cousins|relatives/.test(w) ? 0 : 1; found = true; }
    if (/\b(couple|honeymoon|newly ?weds?)\b/.test(t) && !found) { n = 2; found = true; }
    if (!found && /\b(gf|bf|girlfriend|boyfriend|wife|husband|partner|spouse|friend)\b/.test(t) && /\b(sath|saath|with a|with my|with)\b/.test(t) && !/\bfriends\b/.test(t)) { n = 2; found = true; }
    if (/\b(solo|alone|myself|just me|only me)\b/.test(t)) { n = 1; found = true; }
    if (found && (me || /\bcouple\b/.test(t) || kidsSeen || adultsSeen)) total = n + (kidsSeen && !adultsSeen ? kids : 0) + (adultsSeen ? adults : 0) - (adultsSeen && me ? 0 : 0);
    if (total !== undefined && total < 1) total = undefined;
  }
  if (total === undefined && bare) { const m = /^(\d{1,2})$/.exec(t.trim()); if (m) total = Number(m[1]); }
  return { total: total ? Math.min(total, 80) : undefined, adults: adultsSeen ? adults : undefined, kids: kidsSeen ? kids : undefined };
}

/** "2 rooms", "one room", "3 villas". */
export function parseRooms(clean: string): number | undefined {
  const m = /(\d{1,2})\s*(?:ro+m+s?|villas?|tents?|cottages?|suites?|units?)\b/.exec(clean.toLowerCase());
  return m ? Math.min(Number(m[1]), 20) : undefined;
}

const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const upcoming = (name: string, from = isoToday()) => { const dow = new Date(from + "T00:00:00Z").getUTCDay(); let d = (WD.indexOf(name) - dow + 7) % 7; if (d === 0) d = 7; return addDays(from, d); };

/** Everything we can tell about the stay from one message. `waiting` is what the bot just asked for, which decides how a bare number is read. */
export function extractStay(clean: string, o: { waiting?: "dates" | "nights" | "guests" | "rooms"; checkIn?: string } = {}): StaySlots {
  const t = clean.toLowerCase().replace(/\s+/g, " ").trim();
  const out: StaySlots = { notes: [] };
  const today = isoToday();

  // --- dates ---
  const MON = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  // "dec 24 to 26" → "24 dec to 26 dec"
  const t2 = t.replace(new RegExp(`\\b(${MON})\\s+(\\d{1,2})\\s*(?:to|till|until|-|se)\\s*(\\d{1,2})\\b(?!\\s*(?:${MON}))`), "$2 $1 to $3 $1");
  // "15 tarikh se" → the 15th of this month (or next if passed)
  let t3 = t2;
  const tk = /\b(\d{1,2})\s*(?:tarikh|tareekh|tarik|date)\b/.exec(t2);
  if (tk) { const d = Number(tk[1]); const base = new Date(today + "T00:00:00Z"); let y = base.getUTCFullYear(), m = base.getUTCMonth(); if (d < base.getUTCDate()) { m += 1; if (m > 11) { m = 0; y += 1; } } t3 = t2.replace(tk[0], `${d} ${["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"][m]} ${y}`); }
  const r = parseDateRange(t3);
  if (r.check_in) out.check_in = r.check_in;
  if (r.check_out) out.check_out = r.check_out;
  if (/\btonight\b/.test(t) && !out.check_in) out.check_in = today;
  const days = /(\d{1,2})\s*days?\s*(?:and|,|&)?\s*(\d{1,2})\s*nights?/.exec(t);
  const nightsM = /(\d{1,2})\s*nights?\b/.exec(t);
  const daysM = /(\d{1,2})\s*days?\b/.exec(t);
  if (days) out.nights = Number(days[2]);
  else if (nightsM) out.nights = Number(nightsM[1]);
  else if (daysM && !/\b(today|tomorrow)\b/.test(t.replace(daysM[0], ""))) { out.nights = Math.max(1, Number(daysM[1]) - 1); out.notes.push(`${daysM[1]} days = ${out.nights} night${out.nights === 1 ? "" : "s"}`); }
  if (!out.nights && r.nights) out.nights = r.nights;
  // "4 days from 10 jan": the stated length wins over a derived end date
  if (out.nights && out.check_in && (days || nightsM || daysM) && !/\b(to|till|until|through|thru|se|-)\s*\d{0,2}\s*[a-z0-9]/.test(t.replace(/\d+\s*(days?|nights?)/g, ""))) out.check_out = addDays(out.check_in, out.nights);
  if (/\bweek\b/.test(t) && /\b(1|one|a|for a)\s*week\b/.test(t) && !out.nights) out.nights = 7;
  // "monday to wednesday"
  const wr = new RegExp(`\\b(${WD.join("|")})\\s*(?:to|till|until|-|se)\\s*(${WD.join("|")})\\b`).exec(t);
  if (wr && !out.check_in) { out.check_in = upcoming(wr[1]); const dayDiff = (WD.indexOf(wr[2]) - WD.indexOf(wr[1]) + 7) % 7 || 7; out.check_out = addDays(out.check_in, dayDiff); }
  // "weekend" → Friday to Sunday, said out loud so the guest can correct it
  if (!out.check_in && /\bweekend\b/.test(t)) { const fri = upcoming("friday"); out.check_in = new Date(today + "T00:00:00Z").getUTCDay() === 5 ? today : fri; out.check_out = addDays(out.check_in, 2); out.notes.push("weekend = Fri to Sun"); }
  if (out.check_in && !out.check_out && out.nights) out.check_out = addDays(out.check_in, out.nights);
  if (out.check_in && out.check_out) out.nights = diffDays(out.check_in, out.check_out);
  // a bare number when we asked "how many nights?" is the nights
  if (o.waiting === "nights" && !out.nights && !out.check_out) { const m = /^(\d{1,2})$/.exec(t); if (m && o.checkIn) { out.nights = Number(m[1]); out.check_out = addDays(o.checkIn, out.nights); } }

  // --- people and rooms ---
  const party = parseParty(t, o.waiting === "guests");
  if (party.total) out.guests = party.total;
  if (party.adults !== undefined) out.adults = party.adults;
  if (party.kids !== undefined) out.kids = party.kids;
  const rooms = parseRooms(t);
  if (rooms) out.rooms = rooms;
  else if (o.waiting === "rooms") { const m = /^(\d{1,2})$/.exec(t); if (m) out.rooms = Number(m[1]); }
  return out;
}
