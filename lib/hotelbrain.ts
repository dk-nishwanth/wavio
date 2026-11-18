// The "thinking" half of the hotel bot: pull out what a guest is really asking (which room, what budget, what occasion,
// what kind of question) and compose helpful answers from the resort's own data. Pure functions, no database or sending.
import { estimate } from "./pricing";
import { diffDays } from "./dates";

export type Room = { id: string; name: string; price: number; weekend_price: number | null; capacity: number; units: number; meal_plan: string | null; description: string | null };
export type Occasion = "honeymoon" | "family" | "friends" | "birthday" | "corporate" | "solo";
export type Understanding = {
  rooms: Room[]; budget?: number; occasion?: Occasion; adults?: number; kids?: number; guests?: number;
  q: { price: boolean; inclusions: boolean; capacity: boolean; availability: boolean; details: boolean; suggest: boolean; distance: boolean; discount: boolean; info: boolean };
  question: boolean; qword: boolean; wantsBook: boolean; refersBack: boolean;
};

export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const stem = (w: string) => w.replace(/(es|s)$/, "");
const GENERIC = new Set(["room", "rooms", "suite", "suites", "stay", "the", "a", "an", "and", "of"]);

/** Rooms the guest named. "villa" finds "Pool Villa" (its head word), but "pool" alone does not: that is a question about the pool. */
export function mentionedRooms(t: string, rooms: Room[]): Room[] {
  const text = ` ${norm(t)} `;
  const exact = rooms.filter((r) => text.includes(` ${norm(r.name)} `) || text.includes(` ${norm(r.name)}s `));
  if (exact.length) return exact;
  const words = new Set(norm(t).split(" ").map(stem));
  return rooms.filter((r) => {
    const toks = norm(r.name).split(" ").filter((w) => w.length >= 3 && !GENERIC.has(w));
    const head = toks[toks.length - 1] ?? toks[0];
    // a one-word room name ("Garden") also counts; a modifier ("Pool", "Safari") does not
    return head ? words.has(stem(head)) : false;
  });
}

const money = (s: string) => { const m = /(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh|lac)?/.exec(s); if (!m) return undefined; const n = Number(m[1].replace(/,/g, "")); return m[2] === "k" || m[2] === "thousand" ? n * 1000 : m[2] ? n * 100000 : n; };

export function understand(raw: string, clean: string, rooms: Room[]): Understanding {
  const t = norm(clean);
  const has = (re: RegExp) => re.test(t);
  const q = {
    price: has(/\b(price|prices|rate|rates|cost|costs|charge|charges|tariff|how much|per night|rent|pricing)\b/),
    inclusions: has(/\b(include|included|includes|inclusion|inclusions|breakfast|lunch|dinner|meal|meals|food|buffet|jain|veg|vegetarian)\b/),
    capacity: has(/\b(sleep|sleeps|capacity|accommodate|fits?|fit in|how many (people|guests|persons|adults))\b/),
    availability: has(/\b(available|availability|vacant|vacancy|free on|open on|is it free|any room|rooms free)\b/),
    details: has(/\b(tell me about|details|describe|description|what is|whats|features|private pool|view|bedroom|bedrooms|bathroom|size|beds?|ac|air conditioned)\b/),
    suggest: has(/\b(suggest|recommend|recommendation|which (room|one|stay)|what should|advice|ideal|suitable|best (room|option|for)|good for|which is better)\b/),
    distance: has(/\b(how far|far|door|dur|distance|km|kms|how long|hours from|reach|nearest|airport|railway|station|bus stand|drive)\b/),
    discount: has(/\b(discount|discounts|offer|offers|deal|deals|cheaper|negotiate|best price|reduce|concession|coupon|promo|package deal)\b/),
    info: has(/\b(timings?|timing|open|close|closing|cost|costs|how much|price|allowed|allow|available|facilities|amenities|policy|rules?)\b/),
  };
  const budgetM = /\b(?:under|below|within|upto|up to|max|maximum|budget(?: is| of)?|less than|around|about|not more than)\s*(?:rs\.?|rupees|inr|₹)?\s*(\d[\d,]*\s*(?:k|thousand|lakh|lac)?)/.exec(t) ?? /(\d[\d,]*\s*(?:k|thousand)?)\s*(?:rupees|rs|inr)?\s*(?:per night|a night|budget|max|only)\b/.exec(t);
  const budget = budgetM ? money(budgetM[1]) : undefined;
  const occasion: Occasion | undefined = has(/\b(honeymoon|romantic|couple|anniversary|newly ?wed)\b/) ? "honeymoon" : has(/\b(family|kids|children|child|parents|grandparents|grandma|grandpa|elderly)\b/) ? "family" : has(/\b(friends|group|bachelor|party|gang|boys|girls)\b/) ? "friends" : has(/\bbirthday\b/) ? "birthday" : has(/\b(corporate|office|team outing|offsite|company)\b/) ? "corporate" : has(/\b(solo|alone|myself|just me)\b/) ? "solo" : undefined;
  const adults = /(\d+)\s*adults?/.exec(t)?.[1], kids = /(\d+)\s*(?:kids?|children|child|infants?)/.exec(t)?.[1];
  const total = [...t.matchAll(/(\d{1,2})\s*(?:adults?|kids?|children|child|infants?|people|persons?|guests?)/g)].reduce((a, m) => a + Number(m[1]), 0);
  const roomsM = mentionedRooms(clean, rooms);
  return {
    rooms: roomsM, budget, occasion, adults: adults ? Number(adults) : undefined, kids: kids ? Number(kids) : undefined, guests: total || (occasion === "solo" ? 1 : occasion === "honeymoon" ? 2 : undefined), q,
    qword: has(/^(do|does|did|is|are|can|could|will|would|how|what|which|where|when|who|any|kya|kitna|kitne|whats)\b/) || has(/\b(what|which|how|where|when|why|can you|do you|is there|are there|tell me)\b/),
    question: /\?/.test(raw) || has(/^(do|does|did|is|are|can|could|will|would|how|what|which|where|when|who|any|kya|kitna|kitne|whats)\b/),
    wantsBook: has(/\b(book|reserve|confirm|go ahead|proceed|lets do it|take it|lock it|i ll take|ill take|book it)\b/),
    refersBack: has(/\b(it|that|this|that one|this one|the same|same one|isme|usme)\b/),
  };
}

const sleepsLine = (r: Room) => `Sleeps ${r.capacity}${r.meal_plan ? ` · ${r.meal_plan}` : ""}`;
const rateLine = (r: Room) => `${inr(r.price)}/night${r.weekend_price ? ` (${inr(r.weekend_price)} Fri–Sat)` : ""}`;

/** What the guest asked about one or more specific rooms, answered from the catalog (price first if they asked for price, etc.). */
export function roomAnswer(rooms: Room[], U: Understanding, o: { dates?: { in: string; out: string }; guests?: number; load?: (r: Room) => { full: boolean } | null } = {}): string {
  const g = o.guests ?? U.guests;
  const parts = rooms.slice(0, 3).map((r) => {
    const lines: string[] = [];
    const est = o.dates && estimate(r, o.dates.in, o.dates.out, g ?? 2);
    if (U.q.price || (!U.q.inclusions && !U.q.capacity && !U.q.availability)) lines.push(`*${r.name}* is ${rateLine(r)}.`); else lines.push(`*${r.name}*`);
    if (U.q.inclusions) lines.push(r.meal_plan ? `Included: ${r.meal_plan}.` : "I don't have the meal details for this one — our team can confirm.");
    if (U.q.capacity || g) lines.push(`${g && g > r.capacity ? `It sleeps ${r.capacity}, so ${g} guests need ${Math.ceil(g / r.capacity)} of these` : `Sleeps ${r.capacity}`}${r.units > 1 ? ` · we have ${r.units}` : ""}.`);
    if (!U.q.price || U.q.details) { if (!U.q.inclusions && r.meal_plan) lines.push(`${r.meal_plan}.`); if (r.description) lines.push(`${r.description}.`); }
    if (est && est.nights > 0) lines.push(`For ${est.nights} night${est.nights === 1 ? "" : "s"} that's about ${inr(est.total)}${est.rooms > 1 ? ` (${est.rooms} rooms)` : ""}.`);
    const l = o.load?.(r); if (l?.full) lines.push("⚠️ It's already booked on those dates.");
    return lines.join(" ");
  });
  return parts.join("\n\n");
}

/** Picks rooms for a group, budget or occasion, and says why. Fewest rooms first, then cheapest. */
export function recommend(rooms: Room[], U: Understanding, guests?: number): { text: string; picks: Room[]; needMore?: "guests" } | null {
  if (!rooms.length) return null;
  const g = guests ?? U.guests;
  if (!g && !U.budget && !U.occasion) return { text: "Happy to help you choose! How many guests will be staying, and do you have a budget per night in mind?", picks: [], needMore: "guests" };
  const people = g ?? 2;
  let cands = rooms.map((r) => { const need = Math.max(1, Math.ceil(people / Math.max(1, r.capacity))); return { r, need, nightly: r.price * need }; });
  let intro = `For ${people} guest${people === 1 ? "" : "s"}${U.occasion === "honeymoon" ? " on a honeymoon" : U.occasion === "family" ? " as a family" : U.occasion === "friends" ? " as a group" : ""}${U.budget ? ` within ${inr(U.budget)} a night` : ""}, I'd suggest:`;
  if (U.budget) {
    const ok = cands.filter((c) => c.nightly <= U.budget!);
    if (!ok.length) { const cheapest = [...cands].sort((a, b) => a.nightly - b.nightly)[0]; return { text: `Our most affordable option for ${people} guest${people === 1 ? "" : "s"} is the *${cheapest.r.name}* at ${inr(cheapest.nightly)}/night${cheapest.need > 1 ? ` (${cheapest.need} rooms)` : ""}, a bit above ${inr(U.budget)}. Share your dates and I'll ask our team if they can work something out.`, picks: [cheapest.r] }; }
    cands = ok;
  }
  const romantic = (r: Room) => /pool|private|romantic|deck|view|villa|suite|luxury/i.test(`${r.name} ${r.description ?? ""}`);
  cands.sort((a, b) => a.need - b.need || (U.occasion === "honeymoon" ? Number(romantic(b.r)) - Number(romantic(a.r)) : 0) || a.nightly - b.nightly);
  const picks = cands.slice(0, 2);
  const lines = picks.map((c) => `• *${c.r.name}* — ${inr(c.nightly)}/night${c.need > 1 ? ` (${c.need} rooms of ${c.r.capacity})` : ` · sleeps ${c.r.capacity}`}${c.r.meal_plan ? ` · ${c.r.meal_plan}` : ""}${c.r.description ? `\n  ${c.r.description}` : ""}${U.occasion === "honeymoon" && romantic(c.r) && c.need === 1 ? "\n  💕 A lovely pick for couples" : ""}`);
  return { text: `${intro}\n\n${lines.join("\n")}`, picks: picks.map((c) => c.r) };
}

/** Which rooms look free for the dates, from the bookings already recorded. Always a pointer, never a promise. */
export function availabilityAnswer(rooms: Room[], dates: { in: string; out: string }, guests: number | undefined, load: (r: Room) => { full: boolean } | null): string {
  if (!rooms.length) return "Share your dates and our team will check availability for you.";
  const open = rooms.filter((r) => !load(r)?.full), booked = rooms.filter((r) => load(r)?.full);
  const n = diffDays(dates.in, dates.out);
  const when = `${n} night${n === 1 ? "" : "s"}`;
  if (!open.length) return `Those dates (${when}) look fully booked for now. I can ask our team about a waitlist or nearby dates — want me to?`;
  const list = open.slice(0, 4).map((r) => { const e = estimate(r, dates.in, dates.out, guests ?? 2); return `• *${r.name}* — about ${inr(e.total)} for ${when}${e.rooms > 1 ? ` (${e.rooms} rooms)` : ""}`; }).join("\n");
  return `Good news — based on our current bookings these look open for those dates:\n${list}${booked.length ? `\n(${booked.map((r) => r.name).join(", ")} ${booked.length === 1 ? "is" : "are"} already taken.)` : ""}\n\nOur team confirms every booking, so I'll need to send it to them to hold.`;
}

export const discountAnswer = () => "Our rates change with the season and the length of your stay, and our team can often arrange something for longer stays or groups. Tell me your dates and number of guests and I'll ask them for the best rate.";
