import { all, get, id, now, run } from "./db";
import { addDays, diffDays, isoToday, parseDateRange, parseGuests, pretty } from "./dates";
import { getBusiness } from "./industry";
import { searchKb } from "./kb";
import { listStays } from "./stays";
import { metaCfg, saveMetaCfg } from "./metaleads";
import { queueText } from "./core";
import { runTool, type Ctx, type Step } from "./ai";
import { cachedVocab, normalizeMessage } from "./fuzzy";

// ---------- editable replies (admins can change any of these in the dashboard) ----------
export const DEFAULT_REPLIES: Record<string, string> = {
  greeting: "Hello{name}! Welcome to {resort} 🌿 How can I help you today?",
  menu_body: "Choose an option below, or just type your question.",
  rooms_header: "Here are our stays at {resort}:",
  rooms_none: "Our team will share our room options and rates with you shortly. If you tell me your dates and number of guests, I'll pass them on.",
  rooms_footer: "Rates may vary by season. Tell me your dates and I'll request availability for you.",
  ask_dates: "Which dates would you like to stay? (for example 20 Dec to 23 Dec)",
  ask_nights: "Got it — check-in on {check_in}. How many nights will you stay (or what's the check-out date)?",
  ask_guests: "How many guests will be staying (adults and children together)?",
  ask_room: "Which stay would you like?",
  past_date: "That date has already passed. Could you share your upcoming dates?",
  long_stay: "For stays this long our team will prepare a custom quote — I'm letting them know.",
  confirm_booking: "Please check your request:\n📅 {check_in} → {check_out} ({nights} nights)\n👥 {guests} guests\n🛏 {room}\n\nShall I send this to our team?",
  booking_sent: "Thank you! I've sent your request to our team. They'll confirm availability and the next steps right here.",
  booking_restart: "No problem — let's start again. Which dates would you like to stay?",
  yes_no_prompt: "Please tap Yes or No.",
  cancel_confirm: "Shall I ask our team to cancel booking {booking_id} ({check_in} → {check_out})?",
  cancel_pick: "Which booking would you like to cancel?",
  cancel_sent: "Done — I've asked our team to process the cancellation. They'll confirm here.",
  cancel_none: "I couldn't find an upcoming booking on this number. I've asked our team to help you.",
  cancel_kept: "Okay, I won't cancel anything. Anything else I can help with?",
  status_none: "I can't see any bookings on this number yet. If you've sent a request, our team will confirm it here.",
  status_list: "Here's what I see for you:\n{list}",
  checkin_times: "Check-in is from {check_in_time} and check-out is by {check_out_time}. Early check-in or late check-out can be requested — just ask!",
  location_text: "We're at {address}. I'm sending the map now 📍",
  location_none: "Our team will share directions with you shortly.",
  photos_sent: "Here you go! 📸",
  photos_none: "Our team will share photos with you shortly.",
  service_ack: "Noted! I've asked our team about {service}. They'll get back to you here.",
  callback_ack: "Sure — I've asked our team to call you back on this number.",
  human: "Of course — I've alerted our team. Someone will reply here shortly.",
  complaint: "I'm really sorry about that. I've alerted our team right away and someone will be in touch very soon.",
  thanks: "You're welcome! Is there anything else I can help with?",
  bye: "Take care! Message us here anytime.",
  unknown: "I'm not sure I understood that. Here's what I can help with:",
  unknown_handoff: "Let me get a team member to help you with that — they'll reply here shortly.",
  info_prefix: "",
};
export const REPLY_HELP: Record<string, string> = {
  greeting: "First hello. {name} {resort}", rooms_header: "Before the room list", rooms_footer: "After the room list", confirm_booking: "{check_in} {check_out} {nights} {guests} {room}",
  location_text: "{address}", checkin_times: "{check_in_time} {check_out_time}", service_ack: "{service}", cancel_confirm: "{booking_id} {check_in} {check_out}",
};

type BotCfg = { replies?: Record<string, string> };
export const getReplies = (ws: string): Record<string, string> => ({ ...DEFAULT_REPLIES, ...(((metaCfg(ws) as any).hotelbot as BotCfg | undefined)?.replies ?? {}) });
export function saveReplies(ws: string, replies: Record<string, string>) {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(replies)) if (k in DEFAULT_REPLIES && typeof v === "string" && v.trim() && v !== DEFAULT_REPLIES[k]) clean[k] = v.slice(0, 1000);
  const cfg = metaCfg(ws) as any;
  saveMetaCfg(ws, { ...cfg, hotelbot: { ...(cfg.hotelbot ?? {}), replies: clean } });
}

// ---------- understanding the message ----------
const norm = (t: string) => t.toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word/phrase match that also works for Hindi (Devanagari) text. */
const has = (text: string, phrase: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(norm(phrase))}($|[^\\p{L}\\p{N}])`, "u").test(text);

type Intent = "greeting" | "rooms" | "booking" | "photos" | "location" | "timings" | "cancel" | "status" | "service" | "payment" | "human" | "callback" | "complaint" | "thanks" | "bye" | "menu";
const LEX: Record<Intent, [number, string[]][]> = {
  greeting: [[2, ["hi", "hii", "hiii", "hello", "hey", "hola", "namaste", "namaskar", "नमस्ते", "नमस्कार", "good morning", "good afternoon", "good evening", "start"]]],
  menu: [[4, ["menu", "options", "start over", "main menu", "what can you do", "help"]]],
  rooms: [[3, ["rates", "rate", "price", "prices", "tariff", "cost", "charges", "how much", "kitna", "kimat", "रेट", "किराया", "कीमत", "कितना", "दाम", "per night", "package", "packages", "tariff", "rent", "per day", "daily rate", "room charges", "occupancy", "ac room", "nonac", "deluxe", "luxury", "budget", "cheapest", "rate list", "price list", "kitne ka", "kitne mein", "kitne ke"]], [2, ["room", "rooms", "tent", "tents", "villa", "villas", "suite", "suites", "cottage", "cottages", "accommodation", "stay options", "kamra", "kamre", "कमरा", "कमरे", "रूम"]]],
  booking: [[4, ["book", "booking", "book a room", "reserve", "reservation", "availability", "available", "vacancy", "vacancies", "check availability", "plan my stay", "plan a stay", "enquiry", "inquiry", "want to stay", "looking for a room", "kamra chahiye", "booking karni", "बुकिंग", "बुक", "need a room", "want a room", "room required", "required room", "looking for stay", "plan a trip", "plan trip", "rooms available", "is it available", "any room", "stay karna", "dates available", "available rooms", "room for", "rooms for", "stay for", "want to book", "wants to book", "like to book", "book a stay", "interested in staying"]]],
  photos: [[4, ["photo", "photos", "picture", "pictures", "pics", "images", "gallery", "brochure", "pdf", "video", "tasveer", "फोटो", "तस्वीर"]]],
  location: [[4, ["location", "address", "directions", "map", "how to reach", "how do i reach", "where are you", "where is", "route", "kahan", "landmark", "google maps", "nearest airport", "nearest station", "kaha hai", "pata", "how far", "distance", "reach kaise", "kaise pahunche", "pin location", "send location", "locate", "लोकेशन", "पता", "कहाँ"]]],
  timings: [[4, ["check in time", "check out time", "checkin time", "checkout time", "check in timing", "check out timing", "check in", "check out", "checkin", "checkout"]]],
  cancel: [[5, ["cancel", "cancellation", "cancel my booking", "cancel booking", "cancel karo", "refund", "money back", "paisa wapas", "कैंसिल", "रद्द"]]],
  status: [[4, ["my booking", "booking status", "booking id", "my reservation", "is my booking confirmed", "confirmation", "booking details"]]],
  service: [[4, ["pickup", "pick up", "airport transfer", "transfer", "taxi", "cab", "extra bed", "baby cot", "cot", "late checkout", "late check out", "early check in", "early checkin", "decoration", "decorate", "cake", "surprise", "candle light dinner", "bonfire", "safari", "jeep", "spa", "massage", "laundry", "special request"]]],
  payment: [[4, ["payment link", "pay link", "payment", "advance", "upi", "pay now", "how to pay"]]],
  human: [[5, ["human", "agent", "real person", "manager", "speak to someone", "talk to someone", "speak to a person", "talk to a person", "talk to team", "talk to the team", "representative", "customer care", "customer support", "customer service", "owner", "executive", "insaan", "someone", "concerned person", "contact number", "phone number", "contact details", "number do"]]],
  callback: [[5, ["call me", "call back", "callback", "give me a call", "phone me", "mujhe call"]]],
  complaint: [[5, ["complaint", "complain", "worst", "terrible", "horrible", "disappointed", "unhappy", "disgusting", "dirty", "unacceptable", "very bad", "scam", "cheated", "fraud", "not happy", "pathetic", "bakwas", "rubbish", "waste of money", "no response", "not responding", "ignored"]]],
  thanks: [[3, ["thanks", "thank you", "thankyou", "thx", "shukriya", "dhanyavad", "great thanks", "got it", "ok thanks", "okay thanks"]], [2, ["ok", "great", "nice", "good", "fine", "cool", "perfect", "awesome", "alright", "accha", "theek hai", "sure"]]],
  bye: [[3, ["bye", "goodbye", "see you", "tc", "take care", "good night"]]],
};

export function detectIntents(text: string): { intent: Intent; score: number }[] {
  const t = norm(text);
  const out: { intent: Intent; score: number }[] = [];
  for (const [intent, groups] of Object.entries(LEX) as [Intent, [number, string[]][]][]) {
    let score = 0;
    for (const [w, phrases] of groups) for (const p of phrases) if (has(t, p)) score = Math.max(score, w) + (score ? 0.5 : 0);
    if (score) out.push({ intent, score });
  }
  if (!out.some((x) => x.intent === "booking") && /\b(need|want|require|required|looking for|searching for|wanna|interested in|plan|planning)\b.*\b(room|rooms|stay|villa|villas|tent|tents|cottage|cottages|suite|suites|accommodation)\b/.test(t)) out.push({ intent: "booking", score: 4 });
  // a greeting only counts when it's all the guest said
  return out.filter((x) => !["greeting", "thanks"].includes(x.intent) || t.split(" ").length <= 4).sort((a, b) => b.score - a.score);
}

const YES = ["yes", "y", "yep", "yeah", "ok", "okay", "sure", "confirm", "send", "send it", "yes send it", "go ahead", "correct", "right", "haan", "han", "ha", "theek hai", "done"];
const NO = ["no", "n", "nope", "nahi", "nahin", "change", "edit", "wrong", "incorrect", "not right", "dont send", "start over", "back"];
const yesNo = (text: string): "yes" | "no" | null => { const t = norm(text); if (NO.some((p) => has(t, p))) return "no"; if (YES.some((p) => has(t, p))) return "yes"; return null; };

const STOPWORDS = new Set("a an the is are was were be to of and or in on at for with do does can i you we it this that what how when where which who please my your our me tell about there any have has get got want need would like".split(" "));
/** Very light stemming so "allowed"/"allow" and "pets"/"pet" count as the same word. */
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "").replace(/(.)\1$/, "$1");
const termsOf = (t: string) => [...new Set(norm(t).split(" ").filter((w) => w.length > 2 && !STOPWORDS.has(w)).map(stem))].filter((w) => w.length > 1);
const stemmedText = (t: string) => norm(t).split(" ").map(stem).join(" ");

/** Best sentences from the knowledge base for a free question, or null if nothing really matches. */
export function answerFromKnowledge(ws: string, question: string): string | null {
  const terms = termsOf(question);
  if (!terms.length) return null;
  const hits = searchKb(ws, question, 4);
  let best: { sentences: string; cover: number } | null = null;
  for (const h of hits) {
    const lower = stemmedText(h.text);
    const covered = terms.filter((w) => lower.includes(w));
    const need = terms.length <= 3 ? 1 : 2;
    if (covered.length < need || covered.length / terms.length < 0.4) continue;
    const sents = h.text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    const scored = sents.map((s, i) => ({ s, i, n: terms.filter((w) => stemmedText(s).includes(w)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, 2).sort((a, b) => a.i - b.i);
    if (!scored.length) continue;
    const text = scored.map((x) => x.s).join(" ").slice(0, 420);
    if (!best || covered.length > best.cover) best = { sentences: text, cover: covered.length };
  }
  return best?.sentences ?? null;
}

function matchFaq(ws: string, text: string, vocab: { vocab: Set<string>; byFirst: Map<string, string[]> }) {
  const t = norm(text);
  let best: { faq: any; score: number } | null = null;
  for (const f of all<any>("SELECT * FROM bot_faqs WHERE workspace_id=? AND enabled=1", ws)) {
    let score = 0;
    for (const k of String(f.keywords).split(/[,\n]/).map((x) => x.trim()).filter(Boolean)) { const nk = normalizeMessage(k, vocab); if (nk && has(t, nk)) score += nk.split(" ").length + 1; }
    if (score && (!best || score > best.score)) best = { faq: f, score };
  }
  return best?.faq ?? null;
}

// ---------- vocabulary for spell-correction: every word the bot knows, plus this business's own words ----------
const LEX_WORDS = [...new Set(Object.values(LEX).flatMap((groups) => groups.flatMap(([, ps]) => ps.flatMap((p) => norm(p).split(" ")))))];
const EXTRA_WORDS = ["january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "today", "tomorrow", "weekend", "night", "nights", "adults", "kids", "children", "people", "guests", "persons", "family", "couple", "honeymoon",
  "room", "rooms", "hotel", "resort", "available", "availability", "rates", "price", "please", "facilities", "amenities", "swimming", "pool", "parking", "restaurant", "vegetarian", "breakfast", "lunch", "dinner", "wifi", "policy", "discount", "offer", "offers", "weekdays", "weekend"];
// the words used to answer yes/no and similar must be known too, or "change" gets "corrected" to "charges"
const ANSWER_WORDS = ["change", "changes", "edit", "wrong", "correct", "right", "confirm", "confirmed", "details", "update", "send", "sure", "ahead", "yes", "nope", "nahi", "haan", "back", "again", "different", "another", "instead", "modify", "reschedule", "postpone", "advance", "payment", "discount", "offer", "special", "group", "party", "wedding", "event", "corporate"];
const botVocab = (ws: string) => cachedVocab(`bot:${ws}`, () => {
  const words = [...LEX_WORDS, ...EXTRA_WORDS, ...ANSWER_WORDS];
  for (const p of all<any>("SELECT name FROM products WHERE workspace_id=?", ws)) words.push(...norm(p.name).split(" "));
  for (const f of all<any>("SELECT keywords FROM bot_faqs WHERE workspace_id=? AND enabled=1", ws)) words.push(...norm(f.keywords).split(" "));
  for (const a of all<any>("SELECT label FROM assets WHERE workspace_id=?", ws)) words.push(...norm(a.label).split(" "));
  for (const c of all<any>("SELECT text FROM kb_chunks WHERE workspace_id=? LIMIT 400", ws)) for (const w of norm(c.text).split(" ")) if (w.length >= 4 && words.length < 6000) words.push(w);
  return words;
});

// ---------- the conversation ----------
type State = { step?: string; slots: Record<string, any>; misses: number };
export type BotOut = { replies: string[]; steps: Step[]; handoff: boolean; unknown: boolean; state: State };

const MENU = [
  { title: "Rooms & rates", description: "See our stays and prices" }, { title: "Check availability", description: "Share your dates" }, { title: "Photos", description: "See our rooms and property" },
  { title: "Location", description: "Directions and map" }, { title: "Check-in & out times", description: "Timings and policies" }, { title: "Talk to our team", description: "Chat with a person" },
];

const loadState = (contactId: string): State => { const r = get<any>("SELECT * FROM bot_state WHERE contact_id=?", contactId); return r ? { step: r.step ?? undefined, slots: JSON.parse(r.slots), misses: r.misses } : { slots: {}, misses: 0 }; };
const saveState = (ws: string, contactId: string, s: State) =>
  run("INSERT INTO bot_state (contact_id, workspace_id, step, slots, misses, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(contact_id) DO UPDATE SET step=excluded.step, slots=excluded.slots, misses=excluded.misses, updated_at=excluded.updated_at", contactId, ws, s.step ?? null, JSON.stringify(s.slots), s.misses, now());

const inr = (n: number) => "₹" + Number(n).toLocaleString("en-IN");
const fill = (tpl: string, v: Record<string, any>) => tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? "").toString());

/**
 * One guest message in, replies out. Works without any AI: keyword intents, step-by-step booking questions,
 * your own FAQs, and search over your knowledge. `dry` = playground (nothing sent or saved; pass `state` back each turn).
 */
export async function handleGuest(ws: string, contactId: string | null, text: string, o: { dry?: boolean; state?: State; deferUnknown?: boolean } = {}): Promise<BotOut> {
  const dry = !!o.dry || !contactId;
  const st: State = o.state ? JSON.parse(JSON.stringify(o.state)) : contactId && !dry ? loadState(contactId) : { slots: {}, misses: 0 };
  const ctx: Ctx = { ws, contactId, dry, escalated: false };
  const R = getReplies(ws), biz = getBusiness(ws);
  const out: BotOut = { replies: [], steps: [], handoff: false, unknown: false, state: st };
  const contact = contactId ? get<any>("SELECT name FROM contacts WHERE id=?", contactId) : null;
  const first = contact?.name ? ` ${String(contact.name).split(" ")[0]}` : "";
  const base = { name: first, resort: biz.name || "our resort", address: biz.address || biz.location || "", check_in_time: biz.check_in_time || "12:00 PM", check_out_time: biz.check_out_time || "11:00 AM" };
  const say = (key: string, extra: Record<string, any> = {}) => {
    const msg = fill(R[key] ?? key, { ...base, ...st.slots, ...extra }).replace(/ +\n/g, "\n").trim();
    if (!msg) return;
    out.replies.push(msg);
    if (!dry) queueText(ws, contactId!, msg, { ai: true });
  };
  const tool = async (name: string, input: Record<string, any>) => { const result = await runTool(ctx, name, input); out.steps.push({ tool: name, input, ok: !result.startsWith("error"), result }); return result; };
  const menu = async () => tool("send_menu", { body: R.menu_body, button: "Choose", options: MENU });
  const products = () => all<any>("SELECT id, name, price, description FROM products WHERE workspace_id=? AND active=1 ORDER BY price", ws);
  const finish = () => { if (!dry && contactId) saveState(ws, contactId, st); return out; };
  const handoff = async (reason: string) => { await tool("handoff_to_human", { reason }); out.handoff = true; st.step = undefined; };

  // understand sloppy typing first: "pls tell rates for 2 rooom 20dec 2 23 decmber 4 ppl"
  const vocab = botVocab(ws);
  const clean = normalizeMessage(text, vocab);
  const t = norm(clean);
  const intents = detectIntents(clean);
  const top = intents[0];
  const range = parseDateRange(clean);

  async function continueStep() {
    switch (st.step) {
      case "book": absorb(clean); return bookStep();
      case "book_room": {
        const choice = products().find((p) => has(t, p.name) || t.includes(norm(p.name))) ?? null;
        if (choice) st.slots.room = choice.name; else if (/(any|no preference|anything|koi bhi|cheapest)/.test(t)) st.slots.room = "No preference"; else { say("ask_room"); return; }
        return bookStep();
      }
      case "book_confirm": {
        const yn = yesNo(clean);
        if (yn === "yes") {
          const s = st.slots;
          const res = await tool("create_request", { kind: "booking", summary: `${s.room && s.room !== "No preference" ? s.room : "Stay"} for ${s.guests} guest(s), ${s.check_in} to ${s.check_out}`, details: { check_in_date: s.check_in, check_out_date: s.check_out, guests: s.guests, room: s.room } });
          if (res.startsWith("error")) { st.step = "book"; say("past_date"); return bookStep(); }
          await tool("save_details", { check_in: s.check_in, check_out: s.check_out, guests: String(s.guests), interested_in: s.room });
          say("booking_sent"); st.step = undefined; st.slots = {}; return;
        }
        if (yn === "no") { st.slots = {}; st.step = "book"; say("booking_restart"); return; }
        say("yes_no_prompt"); return confirmButtons();
      }
      case "cancel_pick": {
        const stays = listStays(ws, contactId ?? "").filter((x) => x.status === "upcoming");
        const pick = stays.find((x) => has(t, x.booking_id) || t.includes(norm(x.booking_id)) || t.includes(norm(x.check_in))) ?? (stays.length === 1 ? stays[0] : null);
        if (!pick) { say("cancel_pick"); return; }
        st.slots.cancel = pick.booking_id; st.slots.check_in = pick.check_in; st.slots.check_out = pick.check_out; st.step = "cancel_confirm";
        say("cancel_confirm", { booking_id: pick.booking_id }); return tool("quick_replies", { text: "Please confirm", options: ["Yes, cancel", "No, keep it"] });
      }
      case "cancel_confirm": {
        const yn = yesNo(clean);
        if (yn === "yes") { await tool("create_request", { kind: "cancellation", summary: `Cancel booking ${st.slots.cancel}`, details: { booking_id: st.slots.cancel } }); say("cancel_sent"); st.step = undefined; st.slots = {}; return; }
        if (yn === "no") { say("cancel_kept"); st.step = undefined; st.slots = {}; return; }
        say("yes_no_prompt"); return;
      }
    }
    st.step = undefined;
  }

  const confirmButtons = () => tool("quick_replies", { text: "Send this request to our team?", options: ["Yes, send it", "Change"] });

  /** Asks for the next missing booking detail, or shows the summary to confirm. */
  async function bookStep(): Promise<void> {
    const s = st.slots;
    const today = isoToday();
    if (s.check_in && s.check_in < today) { delete s.check_in; delete s.check_out; delete s.nights; say("past_date"); return; }
    if (s.check_in && s.check_out && s.check_out <= s.check_in) { delete s.check_out; delete s.nights; }
    if (s.check_in && s.check_out) s.nights = diffDays(s.check_in, s.check_out);
    if (s.nights && s.nights > 30) { await handoff("Guest asked for a stay of more than 30 nights"); say("long_stay"); return; }
    if (!s.check_in) { st.step = "book"; s.waiting = "dates"; say("ask_dates"); return; }
    if (!s.check_out) { st.step = "book"; s.waiting = "nights"; say("ask_nights", { check_in: pretty(s.check_in) }); return; }
    if (!s.guests) { st.step = "book"; s.waiting = "guests"; say("ask_guests"); return; }
    const ps = products();
    if (!s.room) {
      if (ps.length > 1) {
        st.step = "book_room";
        say("ask_room");
        await tool("send_menu", { body: R.ask_room, button: "Choose a stay", options: [...ps.slice(0, 9).map((p) => ({ title: p.name, description: `${inr(p.price)}/night` })), { title: "No preference" }] });
        return;
      }
      s.room = ps[0]?.name ?? "No preference";
    }
    st.step = "book_confirm"; delete s.waiting;
    say("confirm_booking", { check_in: pretty(s.check_in), check_out: pretty(s.check_out), nights: s.nights });
    await confirmButtons();
  }

  /** Reads dates/guests/room out of a message into the booking details. */
  function absorb(msg: string) {
    const s = st.slots; const m = norm(msg);
    const r = parseDateRange(msg);
    if (r.check_in && (!s.check_in || s.waiting === "dates")) s.check_in = r.check_in;
    if (r.check_out) s.check_out = r.check_out;
    else if (r.nights && s.check_in) s.check_out = addDays(s.check_in, r.nights);
    if (!r.check_in && s.waiting === "nights") { const n = m.match(/^\d{1,2}$/)?.[0]; if (n && s.check_in) s.check_out = addDays(s.check_in, Number(n)); else if (r.check_in && s.check_in && r.check_in > s.check_in) s.check_out = r.check_in; }
    if (s.check_in && r.check_in && s.waiting === "nights" && !r.check_out && !r.nights && r.check_in > s.check_in) { s.check_out = r.check_in; }
    const g = parseGuests(msg, s.waiting === "guests");
    if (g) s.guests = g;
    const room = products().find((p) => has(m, p.name));
    if (room) s.room = room.name;
  }
  async function freshMessage() {
    // admin-taught questions and answers come first, unless the guest asks for a person / complains / cancels
    const urgent = top && ["human", "complaint", "cancel", "callback"].includes(top.intent);
    if (!urgent) {
      const faq = matchFaq(ws, clean, vocab);
      if (faq) {
        run("UPDATE bot_faqs SET hits=hits+1 WHERE id=?", faq.id);
        const msg = fill(faq.answer, base); out.replies.push(msg); if (!dry) queueText(ws, contactId!, msg, { ai: true });
        if (faq.asset_label) await tool("send_file", { label: faq.asset_label });
        st.misses = 0; return;
      }
    }
    const wantsStay = (top?.intent === "booking" || (top?.intent === "rooms" && (range.check_in || parseGuests(clean)))) || (range.check_in && range.check_out);
    if (top?.intent === "complaint") { await tool("create_request", { kind: "complaint", summary: text.slice(0, 200) }); await handoff("Guest is unhappy: " + text.slice(0, 120)); say("complaint"); return; }
    if (top?.intent === "human") { await handoff("Guest asked to speak to a person"); say("human"); return; }
    if (top?.intent === "callback") { await tool("create_request", { kind: "callback", summary: "Guest asked for a call back", details: { note: text.slice(0, 200) } }); say("callback_ack"); return; }
    if (top?.intent === "cancel") {
      const stays = contactId ? listStays(ws, contactId).filter((x) => x.status === "upcoming") : [];
      if (!stays.length) { await handoff("Guest wants to cancel but no booking was found"); say("cancel_none"); return; }
      if (stays.length === 1) { st.slots = { cancel: stays[0].booking_id, check_in: stays[0].check_in, check_out: stays[0].check_out }; st.step = "cancel_confirm"; say("cancel_confirm", { booking_id: stays[0].booking_id }); await tool("quick_replies", { text: "Please confirm", options: ["Yes, cancel", "No, keep it"] }); return; }
      st.step = "cancel_pick"; say("cancel_pick");
      await tool("send_menu", { body: R.cancel_pick, button: "Bookings", options: stays.slice(0, 10).map((x) => ({ title: x.booking_id, description: `${x.check_in} → ${x.check_out}` })) }); return;
    }
    if (wantsStay) { st.slots = { waiting: undefined }; absorb(clean); if (top?.intent === "rooms") await roomsList(); return bookStep(); }
    if (top?.intent === "rooms") return roomsList(true);
    if (top?.intent === "status") {
      const r = await tool("my_bookings", {});
      if (/Stays: none/.test(r) && /Requests: none/.test(r)) { say("status_none"); return; }
      say("status_list", { list: r.replace(/^Stays: /, "Stays: ").replace(/\nRequests: /, "\nRequests: ") }); return;
    }
    if (top?.intent === "photos") {
      const lib = all<any>("SELECT label FROM assets WHERE workspace_id=?", ws);
      const pick = lib.find((a) => t.includes(norm(a.label)) || norm(a.label).split(" ").some((w) => w.length > 3 && t.includes(w))) ?? (lib.length === 1 ? lib[0] : null);
      if (!lib.length) { say("photos_none"); return; }
      if (pick) { await tool("send_file", { label: pick.label }); say("photos_sent"); return; }
      for (const a of lib.slice(0, 3)) await tool("send_file", { label: a.label });
      say("photos_sent"); return;
    }
    if (top?.intent === "location") {
      const r = await tool("send_location", {});
      if (r.startsWith("error")) say("location_none"); else say("location_text");
      return;
    }
    if (top?.intent === "timings") {
      if (/late|early/.test(t)) { await tool("create_request", { kind: "service", summary: `Timing request: ${text.slice(0, 150)}` }); say("service_ack", { service: /late/.test(t) ? "late check-out" : "early check-in" }); return; }
      say("checkin_times"); return;
    }
    if (top?.intent === "service") {
      const names: [RegExp, string][] = [[/(pick ?up|transfer|taxi|cab|airport)/, "airport pickup / transfer"], [/(extra bed|cot)/, "an extra bed / cot"], [/(decorat|cake|surprise|candle|bonfire)/, "a special arrangement"], [/(safari|jeep)/, "a safari"], [/(spa|massage)/, "spa / massage"], [/laundry/, "laundry"]];
      const svc = names.find(([re]) => re.test(t))?.[1] ?? "your request";
      await tool("create_request", { kind: "service", summary: `${svc}: ${text.slice(0, 160)}`, details: { service: svc, message: text.slice(0, 200), ...(range.check_in ? { date: range.check_in } : {}) } });
      say("service_ack", { service: svc }); return;
    }
    if (top?.intent === "payment") { const r = await tool("my_bookings", {}); const rid = r.match(/rq_[\w-]+/)?.[0]; if (rid) { const p = await tool("send_payment_link", { request_id: rid }); if (!p.startsWith("error")) return; } await handoff("Guest asked about payment"); say("human"); return; }
    if (top?.intent === "thanks") { say("thanks"); return; }
    if (top?.intent === "bye") { say("bye"); return; }
    if (top?.intent === "menu") { say("greeting"); await menu(); return; }
    if (top?.intent === "greeting") { say("greeting"); await menu(); return; }

    // nothing matched: try the knowledge base, then offer the menu, then a person
    const kb = answerFromKnowledge(ws, clean);
    if (kb) { say("info_prefix"); out.replies.push(kb); if (!dry) queueText(ws, contactId!, kb, { ai: true }); st.misses = 0; return; }
    st.misses += 1;
    if (o.deferUnknown) { out.unknown = true; return; }
    out.unknown = true;
    if (st.misses >= 2) { await handoff("The hotel bot couldn't understand the guest twice"); say("unknown_handoff"); return; }
    say("unknown"); await menu();
  }

  async function roomsList(offerBooking = false) {
    const ps = products();
    if (!ps.length) { say("rooms_none"); return; }
    const lines = ps.map((p) => `• *${p.name}* — ${inr(p.price)}/night${p.description ? `\n  ${p.description}` : ""}`).join("\n");
    const msg = `${fill(R.rooms_header, base)}\n\n${lines}${R.rooms_footer ? `\n\n${fill(R.rooms_footer, base)}` : ""}`;
    out.replies.push(msg); if (!dry) queueText(ws, contactId!, msg, { ai: true });
    if (offerBooking) await tool("quick_replies", { text: "Would you like to check availability?", options: ["Check availability", "Photos", "Talk to our team"] });
  }

  // ---- main flow ----
  if (st.step) {
    // an open question (dates, confirmation…) gets the next answer, unless the guest clearly wants something else
    const escape = top && ["human", "complaint", "menu"].includes(top.intent) || (top?.intent === "cancel" && !st.step.startsWith("cancel"));
    if (!escape) { await continueStep(); return finish(); }
    st.step = undefined; st.slots = {};
  }
  await freshMessage();
  return finish();
}
void id;
