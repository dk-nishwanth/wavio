import { all, get, id, now, run } from "./db";
import { addDays, diffDays, isoToday, parseDateRange, parseGuests, pretty } from "./dates";
import { getBusiness } from "./industry";
import { searchKb } from "./kb";
import { listStays } from "./stays";
import { metaCfg, saveMetaCfg } from "./metaleads";
import { queueText } from "./core";
import { runTool, type Ctx, type Step } from "./ai";
import { cachedVocab, normalizeMessage } from "./fuzzy";
import { estimate, money, roomLoad } from "./pricing";
import { extractStay } from "./slots";
import { availabilityAnswer, discountAnswer, mentionedRooms, recommend, roomAnswer, understand, type Room } from "./hotelbrain";
import { HI_REPLIES, MENU_EN, MENU_HI, hasDevanagari } from "./hindi";
import { hoursNote } from "./hours";
import { recordMiss } from "./learning";
import { ingestEvent } from "./events";

// ---------- editable replies (admins can change any of these in the dashboard) ----------
export const DEFAULT_REPLIES: Record<string, string> = {
  greeting: "Hello{name}! Welcome to {resort} 🌿 How can I help you today?",
  menu_body: "Choose an option below, or just type your question.",
  rooms_header: "Here are our stays at {resort}:",
  rooms_none: "{known}Our team will share our room types and rates with you shortly. If you tell me your dates and number of guests, I'll pass them on.",
  rooms_footer: "Rates may vary by season. Tell me your dates and I'll request availability for you.",
  ask_dates: "Which dates would you like to stay? (for example 20 Dec to 23 Dec)",
  ask_nights: "Got it — check-in on {check_in}. How many nights will you stay (or what's the check-out date)?",
  ask_guests: "How many guests will be staying (adults and children together)?",
  ask_room: "Which stay would you like?",
  past_date: "That date has already passed. Could you share your upcoming dates?",
  long_stay: "For stays this long our team will prepare a custom quote — I'm letting them know.",
  confirm_booking: "Please check your request:\n📅 {check_in} → {check_out} ({nights} nights)\n👥 {guests} guests\n🛏 {room}{estimate_line}\n\nShall I send this to our team?",
  ask_edit: "Sure — what would you like to change?",
  already_told: "Yes, I have it: {summary}. Our team will confirm it right here.",
  booking_sent: "Thank you! I've sent your request to our team. They'll confirm availability and the next steps right here.{hours_note}",
  booking_restart: "No problem — let's start again. Which dates would you like to stay?",
  yes_no_prompt: "Please tap Yes or No.",
  cancel_confirm: "Shall I ask our team to cancel booking {booking_id} ({check_in} → {check_out})?",
  cancel_pick: "Which booking would you like to cancel?",
  cancel_sent: "Done — I've asked our team to process the cancellation. They'll confirm here.{hours_note}",
  cancel_none: "I couldn't find an upcoming booking on this number. I've asked our team to help you.",
  cancel_kept: "Okay, I won't cancel anything. Anything else I can help with?",
  status_none: "I can't see any bookings on this number yet. If you've sent a request, our team will confirm it here.",
  status_list: "Here's what I see for you:\n{list}",
  checkin_times: "Check-in is from {check_in_time} and check-out is by {check_out_time}. Early check-in or late check-out can be requested — just ask!",
  location_text: "We're at {address} 📍",
  location_none: "Our team will share directions with you shortly.",
  photos_sent: "Here you go! 📸",
  photos_none: "Our team will share photos with you shortly.",
  service_ack: "Noted! I've asked our team about {service}. They'll get back to you here.{hours_note}",
  callback_ack: "Sure — I've asked our team to call you back on this number.{hours_note}",
  human: "Of course — I've alerted our team. Someone will reply here shortly.{hours_note}",
  complaint: "I'm really sorry about that. I've alerted our team right away and someone will be in touch very soon.{hours_note}",
  thanks: "You're welcome! Is there anything else I can help with?",
  bye: "Take care! Message us here anytime.",
  unknown: "I'm not sure I understood that. Here's what I can help with:",
  unknown_handoff: "Let me get a team member to help you with that — they'll reply here shortly.{hours_note}",
  rating_high: "Thank you so much! 🙏 We're delighted you enjoyed your stay.",
  rating_review_cta: "If you have a minute, a Google review would mean a lot to us:",
  rating_low: "Thank you for telling us, and we're sorry we fell short. I've asked our manager to reach out to you personally.{hours_note}",
  info_prefix: "",
};
export const REPLY_HELP: Record<string, string> = {
  greeting: "First hello. {name} {resort}", rooms_header: "Before the room list", rooms_footer: "After the room list", confirm_booking: "{check_in} {check_out} {nights} {guests} {room} {estimate_line}",
  location_text: "{address}", checkin_times: "{check_in_time} {check_out_time}", service_ack: "{service}", cancel_confirm: "{booking_id} {check_in} {check_out}",
};

type BotCfg = { replies?: Record<string, string> };
const customReplies = (ws: string) => ((metaCfg(ws) as any).hotelbot as BotCfg | undefined)?.replies ?? {};
export const getReplies = (ws: string, lang?: "hi"): Record<string, string> => ({ ...DEFAULT_REPLIES, ...(lang === "hi" ? HI_REPLIES : {}), ...customReplies(ws) });
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
  rooms: [[3, ["rates", "rate", "price", "prices", "tariff", "cost", "charges", "how much", "kitna", "kimat", "रेट", "किराया", "कीमत", "कितना", "दाम", "per night", "package", "packages", "tariff", "rent", "per day", "daily rate", "room charges", "occupancy", "ac room", "nonac", "deluxe", "luxury", "budget", "cheapest", "rate list", "price list", "kitne ka", "kitne mein", "kitne ke", "bhk", "bedroom", "bedrooms", "2 bed", "3 bed", "cottage options", "room types", "types of rooms", "room details", "what all", "what do you have", "what you have", "what do u have", "what options", "options available"]], [2, ["room", "rooms", "tent", "tents", "villa", "villas", "suite", "suites", "cottage", "cottages", "accommodation", "stay options", "kamra", "kamre", "कमरा", "कमरे", "रूम"]]],
  booking: [[4, ["book", "booking", "book a room", "reserve", "reservation", "availability", "available", "vacancy", "vacancies", "check availability", "plan my stay", "plan a stay", "enquiry", "inquiry", "want to stay", "looking for a room", "kamra chahiye", "booking karni", "बुकिंग", "बुक", "उपलब्धता", "कमरा चाहिए", "need a room", "want a room", "room required", "required room", "looking for stay", "plan a trip", "plan trip", "rooms available", "is it available", "any room", "stay karna", "dates available", "available rooms", "room for", "rooms for", "stay for", "want to book", "wants to book", "like to book", "book a stay", "interested in staying", "book karo", "book kar do", "looking for a place", "place to stay", "place for my", "plan a trip", "planning a trip", "planning trip", "vacation", "getaway", "holiday", "anniversary", "birthday celebration", "family trip", "trip with", "booking karo", "book karna"]]],
  photos: [[4, ["photo", "photos", "picture", "pictures", "pics", "images", "gallery", "brochure", "pdf", "video", "tasveer", "फोटो", "तस्वीर"]]],
  location: [[4, ["location", "address", "directions", "map", "how to reach", "how do i reach", "where are you", "where is", "route", "kahan", "landmark", "google maps", "nearest airport", "nearest station", "kaha hai", "pata", "how far", "distance", "reach kaise", "kaise pahunche", "pin location", "send location", "locate", "लोकेशन", "पता", "कहाँ"]]],
  timings: [[4, ["late night arrival", "late arrival", "arrival time", "arriving late", "reach late", "check in time", "check out time", "checkin time", "checkout time", "check in timing", "check out timing", "check in", "check out", "checkin", "checkout", "चेक इन", "चेक आउट", "चेक-इन", "चेक-आउट"]]],
  cancel: [[5, ["cancel", "cancellation", "cancel my booking", "cancel booking", "cancel karo", "refund", "money back", "paisa wapas", "कैंसिल", "रद्द"]]],
  status: [[4, ["my booking", "booking status", "booking id", "my reservation", "is my booking confirmed", "confirmation", "booking details"]]],
  service: [[4, ["pickup", "pick up", "airport transfer", "transfer", "taxi", "cab", "extra bed", "baby cot", "cot", "late checkout", "late check out", "early check in", "early checkin", "decoration", "decorate", "cake", "surprise", "candle light dinner", "bonfire", "safari", "jeep", "spa", "massage", "laundry", "special request"]]],
  payment: [[4, ["payment link", "pay link", "payment", "paid", "receipt", "transaction", "screenshot", "payment done", "paid already", "advance", "upi", "pay now", "how to pay"]]],
  human: [[5, ["human", "agent", "real person", "manager", "speak to someone", "talk to someone", "speak to a person", "talk to a person", "talk to team", "talk to the team", "talk to our team", "टीम से बात", "बात करें", "representative", "customer care", "customer support", "customer service", "owner", "executive", "insaan", "someone", "concerned person", "contact number", "phone number", "contact details", "number do"]]],
  callback: [[5, ["call me", "call back", "callback", "give me a call", "phone me", "mujhe call"]]],
  complaint: [[5, ["complaint", "complain", "worst", "terrible", "horrible", "disappointed", "unhappy", "disgusting", "dirty", "unacceptable", "very bad", "scam", "cheated", "fraud", "not happy", "pathetic", "bakwas", "rubbish", "waste of money", "no response", "not responding", "ignored"]]],
  thanks: [[3, ["thanks", "thank you", "thankyou", "thx", "shukriya", "dhanyavad", "great thanks", "got it", "ok thanks", "okay thanks", "thanks a lot", "thank you so much", "great service", "good service", "excellent service", "many thanks", "thanks so much", "thank u", "thanku", "tysm"]], [2, ["ok", "great", "nice", "good", "fine", "cool", "perfect", "awesome", "alright", "accha", "theek hai", "sure"]]],
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
  return out.filter((x) => !["greeting", "thanks"].includes(x.intent) || t.split(" ").length <= (x.intent === "thanks" && /thank|thx|shukriya|dhanyavad|great service|tysm/.test(t) ? 9 : 4)).sort((a, b) => b.score - a.score);
}

const YES = ["yes", "y", "yep", "yeah", "ok", "okay", "sure", "confirm", "send", "send it", "yes send it", "go ahead", "correct", "right", "haan", "han", "ha", "theek hai", "done", "book it", "book kar do", "kar do", "bhej do", "bhejo", "do it", "proceed", "confirmed", "ji", "sahi hai", "ok done"];
const NO = ["no", "n", "nope", "nahi", "nahin", "change", "edit", "wrong", "incorrect", "not right", "dont send", "start over", "back"];
const yesNo = (text: string): "yes" | "no" | null => { const t = norm(text); if (NO.some((p) => has(t, p))) return "no"; if (YES.some((p) => has(t, p))) return "yes"; return null; };

const STOPWORDS = new Set("free kitna door dur far distance long available avail hai hain kya ke ka ki ko se mein me hota hoti milega milegi provide provided aap kar karo ho hoga tha thi the a an the is are was were be to of and or in on at for with do does can i you we it this that what how when where which who please my your our me tell about there any have has get got want need would like".split(" "));
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
    const hasW = (txt: string, w: string) => new RegExp(`(^| )${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(txt);
    const ranked = sents.map((s, i) => { const st = stemmedText(s); return { s, i, n: terms.filter((w) => hasW(st, w)).length }; }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i);
    const scored = ranked.filter((x) => x.n === ranked[0]?.n).slice(0, 2).sort((a, b) => a.i - b.i);
    if (!scored.length) continue;
    const text = scored.map((x) => x.s).join(" ").slice(0, 420);
    if (!best || covered.length > best.cover) best = { sentences: text, cover: covered.length };
  }
  return best?.sentences ?? null;
}

/** Every taught answer whose words appear in the message, best first (so "pets and wifi" gets both). */
function matchFaqs(ws: string, text: string, vocab: { vocab: Set<string>; byFirst: Map<string, string[]> }) {
  const t = norm(text);
  const hits: { faq: any; score: number }[] = [];
  for (const f of all<any>("SELECT * FROM bot_faqs WHERE workspace_id=? AND enabled=1", ws)) {
    let score = 0;
    for (const k of String(f.keywords).split(/[,\n]/).map((x) => x.trim()).filter(Boolean)) { const nk = normalizeMessage(k, vocab); if (nk && has(t, nk)) score += nk.split(" ").length + 1; }
    if (score) hits.push({ faq: f, score });
  }
  return hits.sort((a, b) => b.score - a.score).map((h) => h.faq);
}

// ---------- vocabulary for spell-correction: every word the bot knows, plus this business's own words ----------
const LEX_WORDS = [...new Set(Object.values(LEX).flatMap((groups) => groups.flatMap(([, ps]) => ps.flatMap((p) => norm(p).split(" ")))))];
const EXTRA_WORDS = ["gf", "bf", "girlfriend", "boyfriend", "partner", "sath", "saath", "arrival", "arriving", "receipt", "tarikh", "tareekh", "tarik", "bus", "train", "taxi", "cab", "cheaper", "costly", "expensive", "mehnga", "mahenga", "pricey", "sasta", "advance", "deposit", "upi", "geyser", "mattress", "conference", "hall", "reschedule", "postpone", "places", "place", "visit", "nearby", "attractions", "sightseeing", "temple", "lake", "fort", "market", "wildlife", "sunrise", "sunset", "wife", "husband", "mother", "father", "mom", "dad", "son", "daughter", "brother", "sister", "friend", "friends", "parents", "family", "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "today", "tomorrow", "weekend", "night", "nights", "adults", "kids", "children", "people", "guests", "persons", "family", "couple", "honeymoon",
  "room", "rooms", "hotel", "resort", "available", "availability", "rates", "price", "please", "facilities", "amenities", "swimming", "pool", "parking", "restaurant", "vegetarian", "breakfast", "lunch", "dinner", "wifi", "policy", "discount", "offer", "offers", "weekdays", "weekend"];
// the words used to answer yes/no and similar must be known too, or "change" gets "corrected" to "charges"
const ANSWER_WORDS = ["star", "stars", "rating", "rated", "stayed", "review", "change", "changes", "edit", "wrong", "correct", "right", "confirm", "confirmed", "details", "update", "send", "sure", "ahead", "yes", "nope", "nahi", "haan", "back", "again", "different", "another", "instead", "modify", "reschedule", "postpone", "advance", "payment", "discount", "offer", "special", "group", "party", "wedding", "event", "corporate"];
const botVocab = (ws: string) => cachedVocab(`bot:${ws}`, () => {
  const words = [...LEX_WORDS, ...EXTRA_WORDS, ...ANSWER_WORDS];
  for (const p of all<any>("SELECT name FROM products WHERE workspace_id=?", ws)) words.push(...norm(p.name).split(" "));
  for (const f of all<any>("SELECT keywords FROM bot_faqs WHERE workspace_id=? AND enabled=1", ws)) words.push(...norm(f.keywords).split(" "));
  for (const a of all<any>("SELECT label FROM assets WHERE workspace_id=?", ws)) words.push(...norm(a.label).split(" "));
  for (const c of all<any>("SELECT text FROM kb_chunks WHERE workspace_id=? LIMIT 400", ws)) for (const w of norm(c.text).split(" ")) if (w.length >= 4 && words.length < 6000) words.push(w);
  return words;
});

// ---------- the conversation ----------
export type Memory = { menu?: boolean; room?: string; guests?: number; budget?: number; dates?: { in: string; out: string }; booked?: { in: string; out: string; guests?: number; room?: string; at: number; estimate?: number; rooms?: number } };
type State = { step?: string; slots: Record<string, any>; misses: number; lang?: "hi"; ctx?: Memory };
export type BotOutput = { type: "text"; text: string } | { type: "tool"; tool: string; input: any; ok: boolean; result: string };
export type BotDebug = { clean: string; intents: { intent: string; score: number }[]; dates: any; guests: number | null; lang: string; step?: string; route: string };
export type BotOut = { replies: string[]; steps: Step[]; outputs: BotOutput[]; debug: BotDebug; handoff: boolean; unknown: boolean; state: State };


const loadState = (contactId: string): State => { const r = get<any>("SELECT * FROM bot_state WHERE contact_id=?", contactId); if (!r) return { slots: {}, misses: 0 }; const { __lang, __ctx, ...slots } = JSON.parse(r.slots); return { step: r.step ?? undefined, slots, misses: r.misses, lang: __lang, ctx: __ctx }; };
const saveState = (ws: string, contactId: string, s: State) =>
  run("INSERT INTO bot_state (contact_id, workspace_id, step, slots, misses, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(contact_id) DO UPDATE SET step=excluded.step, slots=excluded.slots, misses=excluded.misses, updated_at=excluded.updated_at", contactId, ws, s.step ?? null, JSON.stringify({ ...s.slots, ...(s.lang ? { __lang: s.lang } : {}), ...(s.ctx && Object.keys(s.ctx).length ? { __ctx: s.ctx } : {}) }), s.misses, now());

const inr = (n: number) => "₹" + Number(n).toLocaleString("en-IN");
const fill = (tpl: string, v: Record<string, any>) => tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? "").toString());

/**
 * One guest message in, replies out. Works without any AI: keyword intents, step-by-step booking questions,
 * your own FAQs, and search over your knowledge. `dry` = playground (nothing sent or saved; pass `state` back each turn).
 */
export async function handleGuest(ws: string, contactId: string | null, text0: string, o: { dry?: boolean; state?: State; deferUnknown?: boolean } = {}): Promise<BotOut> {
  const dry = !!o.dry || !contactId;
  const st: State = o.state ? JSON.parse(JSON.stringify(o.state)) : contactId && !dry ? loadState(contactId) : { slots: {}, misses: 0 };
  let text = text0;
  { const d = /^\s*(\d)\s*[.)]?\s*$/.exec(text0); const mm = st.lang === "hi" ? MENU_HI : MENU_EN; if (d && st.ctx?.menu && !st.step && Number(d[1]) >= 1 && Number(d[1]) <= mm.length) text = mm[Number(d[1]) - 1].title; }
  const ctx: Ctx = { ws, contactId, dry, escalated: false };
  if (hasDevanagari(text)) st.lang = "hi"; else if (/[a-z]{3,}/i.test(text)) st.lang = undefined; // follows the language the guest is using
  const R = getReplies(ws, st.lang), biz = getBusiness(ws);
  const MENU = st.lang === "hi" ? MENU_HI : MENU_EN;
  const out: BotOut = { replies: [], steps: [], outputs: [], debug: { clean: "", intents: [], dates: {}, guests: null, lang: st.lang ?? "en", step: st.step, route: "" }, handoff: false, unknown: false, state: st };
  const emit = (msg: string) => { out.replies.push(msg); out.outputs.push({ type: "text", text: msg }); if (!dry) queueText(ws, contactId!, msg, { ai: true }); };
  const contact = contactId ? get<any>("SELECT name FROM contacts WHERE id=?", contactId) : null;
  const first = contact?.name ? ` ${String(contact.name).split(" ")[0]}` : "";
  const base = { name: first, resort: biz.name || "our resort", address: biz.address || biz.location || "", check_in_time: biz.check_in_time || "12:00 PM", check_out_time: biz.check_out_time || "11:00 AM", hours_note: hoursNote(ws) };
  let takeAckSafe: () => string = () => "";
  const say = (key: string, extra: Record<string, any> = {}) => {
    const msg = (takeAckSafe() + fill(R[key] ?? key, { ...base, known: "", ...st.slots, ...extra })).replace(/ +\n/g, "\n").trim();
    if (!msg) return;
    emit(msg);
  };
  const tool = async (name: string, input: Record<string, any>) => { const result = await runTool(ctx, name, input); const ok = !result.startsWith("error"); out.steps.push({ tool: name, input, ok, result }); out.outputs.push({ type: "tool", tool: name, input, ok, result }); return result; };
  const menu = async () => tool("send_menu", { body: R.menu_body, button: "Choose", options: MENU });
  const products = () => all<any>("SELECT id, name, price, description, capacity, units, weekend_price, meal_plan FROM products WHERE workspace_id=? AND active=1 ORDER BY price", ws);
  const finish = () => { if (!dry && contactId) saveState(ws, contactId, st); return out; };
  const handoff = async (reason: string) => { await tool("handoff_to_human", { reason }); out.handoff = true; st.step = undefined; };

  // understand sloppy typing first: "pls tell rates for 2 rooom 20dec 2 23 decmber 4 ppl"
  const vocab = botVocab(ws);
  const clean = normalizeMessage(text, vocab);
  const t = norm(clean);
  const intents = detectIntents(clean);
  const top = intents[0];
  const range = parseDateRange(clean);
  out.debug = { clean, intents: intents.slice(0, 4), dates: range, guests: parseGuests(clean), lang: st.lang ?? "en", step: st.step, route: st.step ? `continuing: ${st.step}` : "" };

  // ======== what is this message about? ========
  const rooms = products() as Room[];
  const U = understand(text, clean, rooms);
  const mem: Memory = (st.ctx ??= {});
  mem.menu = false;
  const todayIso = isoToday();
  const roomByName = (n?: string) => rooms.find((r) => !!n && r.name.toLowerCase() === n.toLowerCase());
  const exFor = (waiting?: any) => extractStay(clean, { waiting, checkIn: st.slots.check_in });
  const exNow = exFor(st.slots.waiting);
  const shortMsg = t.split(" ").length <= 7;
  // "what about the villa?" names a room; "how much is it?" / "and breakfast?" refer to the one we were just discussing
  const refRooms: Room[] = U.rooms.length ? U.rooms : mem.room && U.refersBack ? ([roomByName(mem.room)].filter(Boolean) as Room[]) : [];
  const generalRoomQ = top?.intent !== "service" && (U.qword || U.question) && !U.rooms.length && !refRooms.length && (U.q.inclusions || U.q.capacity || U.q.details) && !U.q.suggest && !U.budget;
  let pendingAck = "";
  const takeAck = () => { const a = pendingAck; pendingAck = ""; return a ? a + " " : ""; };
  takeAckSafe = takeAck;
  const askMenu = async (msg: string, button: string, options: { title: string; description?: string }[]) => { mem.menu = options === MENU; out.replies.push(msg); await tool("send_menu", { body: msg.slice(0, 1000), button, options }); };
  const askButtons = async (msg: string, options: string[]) => { out.replies.push(msg); await tool("quick_replies", { text: msg.slice(0, 1000), options }); };
  const greetMenu = async (greet?: string) => askMenu(`${greet ?? fill(R.greeting, base)}\n\n${R.menu_body}`, "Choose", MENU);
  const dateSummary = (s: { in: string; out: string; guests?: number; room?: string }) => `${pretty(s.in)} → ${pretty(s.out)}${s.guests ? `, ${s.guests} guest${s.guests === 1 ? "" : "s"}` : ""}${s.room && s.room !== "No preference" ? `, ${s.room}` : ""}`;
  const loadFor = (dates?: { in: string; out: string }) => (r: Room) => (dates ? roomLoad(ws, r.name, dates.in, dates.out) : null);

  /** Applies what this message says to the booking in progress. Returns a short "Noted — …" line for what changed. */
  function absorb(override = false): string {
    const s = st.slots; const ex = exFor(s.waiting); const changes: string[] = [];
    const set = (k: string, v: any, label: string) => { if (v === undefined || v === null || s[k] === v) return; s[k] = v; changes.push(label); };
    const asksNights = s.waiting === "nights";
    if (asksNights && !ex.check_out && !ex.nights && ex.check_in && s.check_in && ex.check_in > s.check_in) { s.check_out = ex.check_in; changes.push(`check-out ${pretty(ex.check_in)}`); }
    else if (ex.check_in && (override || !s.check_in || s.waiting === "dates")) {
      if (override && s.check_in && s.check_out && !ex.check_out && !ex.nights) { const n = diffDays(s.check_in, s.check_out); s.check_in = ex.check_in; s.check_out = addDays(ex.check_in, n); changes.push(`check-in ${pretty(ex.check_in)}`); }
      else set("check_in", ex.check_in, `check-in ${pretty(ex.check_in)}`);
    }
    if (ex.check_out && !(asksNights && !ex.nights && !ex.check_in && false)) set("check_out", ex.check_out, `check-out ${pretty(ex.check_out)}`);
    else if (ex.nights && s.check_in && (override || !s.check_out || asksNights || /\bnights?\b/.test(t))) { const co = addDays(s.check_in, ex.nights); if (s.check_out !== co) { s.check_out = co; if (!ex.notes.length) changes.push(`${ex.nights} night${ex.nights === 1 ? "" : "s"}`); } }
    if (ex.nights && !s.check_in && !ex.check_in) s.nights_hint = ex.nights;
    if (ex.kids && !ex.adults && s.guests && /\b(bhi|also|more|extra|plus|too)\b/.test(t)) { ex.guests = s.guests + ex.kids; ex.adults = s.adults ?? s.guests; ex.kids = (s.kids ?? 0) + ex.kids; }
    if (ex.guests) set("guests", ex.guests, `${ex.guests} guest${ex.guests === 1 ? "" : "s"}`);
    if (ex.kids !== undefined) s.kids = ex.kids;
    if (ex.adults !== undefined) s.adults = ex.adults;
    if (ex.rooms) set("rooms_wanted", ex.rooms, `${ex.rooms} room${ex.rooms === 1 ? "" : "s"}`);
    if (U.rooms.length === 1) set("room", U.rooms[0].name, U.rooms[0].name);
    if (ex.notes.length) changes.push(...ex.notes);
    return changes.length ? `Noted — ${changes.join(", ")}.` : "";
  }

  /** Asks for the next missing detail, or shows the summary for confirmation. One message at a time, with what we just learned. */
  async function bookStep(ack = ""): Promise<void> {
    const s = st.slots; pendingAck = ack;
    if (s.check_in && s.check_in < todayIso) { delete s.check_in; delete s.check_out; delete s.nights; st.step = "book"; s.waiting = "dates"; say("past_date"); return; }
    if (s.check_in && s.check_out && s.check_out <= s.check_in) { delete s.check_out; delete s.nights; }
    if (s.check_in && s.check_out) s.nights = diffDays(s.check_in, s.check_out);
    if (s.nights && s.nights > 30) { await handoff("Guest asked for a stay of more than 30 nights"); say("long_stay"); return; }
    if (s.check_in && !s.check_out && s.nights_hint) { s.check_out = addDays(s.check_in, s.nights_hint); s.nights = s.nights_hint; delete s.nights_hint; }
    if (!s.check_in) { st.step = "book"; s.waiting = "dates"; say("ask_dates"); return; }
    if (!s.check_out) { st.step = "book"; s.waiting = "nights"; if (pendingAck) { emit(takeAck() + R.ask_nights.replace(/^Got it[^.]*\.\s*/, "")); return; } say("ask_nights", { check_in: pretty(s.check_in) }); return; }
    if (!s.guests) { st.step = "book"; s.waiting = "guests"; say("ask_guests"); return; }
    if (!s.room && s.pref === "cheapest" && rooms.length) { const c = [...rooms].sort((a, b) => a.price - b.price)[0]; s.room = c.name; delete s.pref; pendingAck = (pendingAck ? pendingAck + " " : "") + `Noted — ${c.name}, our most affordable.`; }
    if (!s.room) {
      if (rooms.length > 1) {
        st.step = "book_room"; delete s.waiting;
        const opts = rooms.slice(0, 9).map((p) => {
          const e = estimate(p, s.check_in, s.check_out, s.guests ?? 2, s.rooms_wanted);
          const full = roomLoad(ws, p.name, s.check_in, s.check_out)?.full;
          return { title: p.name, description: full ? "Already booked on those dates" : `${inr(e.total)} for ${e.nights} night${e.nights === 1 ? "" : "s"}${e.rooms > 1 ? ` (${e.rooms} rooms)` : ""}` };
        });
        await askMenu(`${takeAck()}${R.ask_room}`, "Choose a stay", [...opts, { title: "No preference" }]);
        return;
      }
      s.room = rooms[0]?.name ?? "No preference";
    }
    st.step = "book_confirm"; delete s.waiting;
    const chosen = roomByName(s.room);
    const est = chosen ? estimate(chosen, s.check_in, s.check_out, s.guests, s.rooms_wanted) : null;
    s.estimate = est?.total; s.rooms_needed = est?.rooms;
    const estimate_line = est ? `\n💰 Estimated ${inr(est.total)} for ${est.nights} night${est.nights === 1 ? "" : "s"}${est.rooms > 1 ? ` (${est.rooms} rooms)` : ""} — final price confirmed by our team` : "";
    const roomLabel = s.room === "No preference" || !s.room ? "Any room" : `${s.room}${est && est.rooms > 1 ? ` × ${est.rooms}` : ""}`;
    const kids = s.kids && (s.adults ?? s.guests - s.kids) > 0 ? ` (${s.adults ?? s.guests - s.kids} adults, ${s.kids} kid${s.kids === 1 ? "" : "s"})` : "";
    const msg = takeAck() + fill(R.confirm_booking, { ...base, ...s, room: roomLabel, check_in: pretty(s.check_in), check_out: pretty(s.check_out), nights: s.nights, estimate_line, guests: `${s.guests}${kids}`.replace(/ guests$/, "") });
    await askButtons(msg.replace(/ +\n/g, "\n").replace(/\b1 nights\b/g, "1 night").replace(/\b1 guests\b/g, "1 guest").trim(), ["Yes, send it", "Change"]);
  }

  /** The questions inside a message (taught answers, a named room, a recommendation, availability, knowledge) answered as one reply. */
  async function collectAnswers(): Promise<{ text: string; kind: string; asset?: string }> {
    const parts: string[] = []; let kind = ""; let asset: string | undefined;
    let faqText = t;
    for (const r of U.rooms) faqText = faqText.replace(new RegExp(norm(r.name), "g"), " "); // "pool villa" is a room, not the pool
    const faqs = matchFaqs(ws, faqText, vocab).slice(0, 3);
    for (const f of faqs) { run("UPDATE bot_faqs SET hits=hits+1 WHERE id=?", f.id); parts.push(fill(f.answer, base)); asset = asset ?? f.asset_label ?? undefined; kind = "faq"; out.debug.route = `your answer for: ${f.keywords}`; }
    if (faqs.length) return { text: parts.join("\n\n"), kind, asset };
    const guests = exNow.guests ?? U.guests ?? st.slots.guests ?? mem.guests ?? mem.booked?.guests;
    const dates = exNow.check_in && exNow.check_out ? { in: exNow.check_in, out: exNow.check_out } : mem.dates;
    const roomQ = U.q.price || U.q.inclusions || U.q.capacity || U.q.details || U.q.availability || U.qword || U.rooms.length > 0;
    if (U.rooms.length >= 2 && (U.q.suggest || /\b(better|best|which|or|vs|difference|compare)\b/.test(t)) && rooms.length) {
      const rec = recommend(U.rooms, U, guests ?? st.slots.guests);
      if (rec) { return { text: rec.text, kind: "recommend", asset }; }
    }
    if (rooms.length && U.q.price && exNow.nights && !exNow.check_in && !U.rooms.length) {
      parts.push(`For ${exNow.nights} night${exNow.nights === 1 ? "" : "s"} (weekday rates):\n` + rooms.map((r) => `• *${r.name}* — ${inr(r.price * exNow.nights!)}`).join("\n") + "\nTell me your dates and I'll check availability.");
      return { text: parts.join("\n\n"), kind: "price", asset };
    }
    const kbFirst = (generalRoomQ || U.q.distance) && !U.rooms.length ? answerFromKnowledge(ws, clean) : null;
    if (kbFirst) { parts.push(kbFirst); kind = "kb"; out.debug.route = "answer found in your knowledge"; }
    else if ((refRooms.length || generalRoomQ) && roomQ && !U.q.suggest && top?.intent !== "photos") {
      parts.push(roomAnswer(refRooms.length ? refRooms : rooms, U, { dates, guests, load: loadFor(dates) })); kind = "room"; out.debug.route = `about: ${refRooms.map((r) => r.name).join(", ")}`;
      if (refRooms.length === 1) mem.room = refRooms[0].name;
    } else if (rooms.length && (U.q.suggest || (U.occasion && (U.qword || U.q.suggest)) || (U.budget && !refRooms.length) || (U.q.capacity && U.guests && !refRooms.length))) {
      const rec = recommend(rooms, U, guests);
      if (rec) { parts.push(rec.text); kind = rec.needMore ? "ask" : "recommend"; out.debug.route = "recommendation"; if (rec.picks[0]) mem.room = rec.picks[0].name; }
    } else if (U.q.availability && exNow.check_in && rooms.length) {
      const d = { in: exNow.check_in, out: exNow.check_out ?? addDays(exNow.check_in, exNow.nights ?? 1) };
      parts.push(availabilityAnswer(refRooms.length ? refRooms : rooms, d, guests, loadFor(d))); kind = "availability"; out.debug.route = "availability";
    } else if (U.q.discount) { parts.push(discountAnswer()); kind = "discount"; out.debug.route = "discount"; }
    else {
      const operational = !!top && [...(U.wantsBook || exNow.check_in || exNow.guests ? ["booking"] : []), "cancel", "human", "complaint", "callback", "status", "payment", "photos", "greeting", "thanks", "bye", "menu"].includes(top.intent);
      if (!operational && (U.qword || U.q.info || U.q.distance || (!top && (U.question || shortMsg)))) { const kb = answerFromKnowledge(ws, clean); if (kb) { parts.push(kb); kind = "kb"; out.debug.route = "answer found in your knowledge"; } }
    }
    return { text: parts.join("\n\n"), kind, asset };
  }

  const hello = /^(hi|hii|hello|hey|namaste|good (morning|afternoon|evening))\b/.test(t) && t.split(" ").length > 3 ? fill("Hello{name}! ", base) : "";
  const isSideQuestion = () => { const slotInfo = !!(exNow.check_in || exNow.check_out || exNow.nights || exNow.guests || exNow.rooms); return (U.qword || U.q.discount || U.q.distance || U.q.suggest) && !(slotInfo && !U.qword) || (U.qword && U.rooms.length === 0 && !slotInfo); };

  async function continueStep() {
    const s = st.slots;
    if (st.step && st.step.startsWith("book") && !s.room && /\b(cheapest|cheap|lowest|sasta|sabse sasta|jo sasta)\b/.test(t)) s.pref = "cheapest";
    if (st.step && st.step.startsWith("book") && s.check_in && /\b(already|told|said|mentioned|earlier|above|before)\b/.test(t) && !(exNow.check_in || exNow.check_out || exNow.nights || exNow.guests)) {
      out.debug.route = "reminding what they said";
      return bookStep(`You're right, sorry! I have ${dateSummary({ in: s.check_in, out: s.check_out ?? s.check_in, guests: s.guests, room: s.room })}.`);
    }
    if (st.step && st.step.startsWith("book") && top?.intent === "rooms" && !U.rooms.length && !(exNow.check_in || exNow.check_out || exNow.nights || exNow.guests || exNow.rooms) && !U.q.suggest && !/\b(any|no preference|anything|koi bhi|cheapest|whichever|same)\b/.test(t)) {
      out.debug.route = "intent: rooms"; await roomsList(); return bookStep();
    }
    switch (st.step) {
      case "book": case "book_room": {
        const nod = /^(yes|yeah|ok|okay|haan|ha|ya|hmm|hm|sure|done|fine|book it|go ahead)( please| pls| plz)?$/.test(t);
        if (nod && st.step === "book_room" && !s.room) { s.room = mem.room ?? "No preference"; return bookStep(); }
        if (nod) return bookStep();
        if (st.step === "book_room" && !s.room && /\b(cheapest|cheap|lowest|sasta|sabse sasta)\b/.test(t)) { const c = [...rooms].sort((a, b) => a.price - b.price).find((r) => true); if (c) { s.room = c.name; return bookStep(`Noted — ${c.name}, our most affordable.`); } }
        const askingAboutRoom = U.rooms.length > 0 && (U.q.price || U.q.inclusions || U.q.capacity || U.q.details || U.question) && !U.wantsBook;
        const qWithInfo = ((U.qword || U.question) && ["timings", "location", "photos", "service"].includes(top?.intent ?? "")) || (U.q.price && !!exNow.nights && !exNow.check_in && !s.check_in);
        const pushback = qWithInfo || /\b(too )?(costly|expensive|mehnga|mahenga|pricey|too much|cheaper|sasta|sasti|discount)\b/.test(t);
        const info = !pushback && !askingAboutRoom && !!(exNow.check_in || exNow.check_out || exNow.nights || exNow.guests || exNow.rooms || U.rooms.length || /(any|no preference|anything|koi bhi|cheapest|whichever|same)/.test(t));
        if (!info && await sideTurn()) return bookStep();
        const pushback0 = /\b(cheaper|costly|expensive|mehnga|sasta|discount)\b/.test(t);
        const side = false;
        const ack = absorb();
        if (st.step === "book_room" && !s.room && /\b(any|no preference|anything|koi bhi|whichever)\b/.test(t) && !pushback0) s.room = "No preference";
        if (side) { const a = await collectAnswers(); if (a.text) emit(a.text); if (a.asset) await tool("send_file", { label: a.asset }); }
        return bookStep(ack);
      }
      case "book_confirm": {
        const yn = yesNo(clean);
        const qInfo = (U.qword || U.question) && ["timings", "location", "photos", "service"].includes(top?.intent ?? "");
        const hasInfo = !qInfo && !!(exNow.check_in || exNow.check_out || exNow.nights || exNow.guests || exNow.rooms || U.rooms.length);
        if (yn === "yes" && !hasInfo) {
          const res = await tool("create_request", { kind: "booking", summary: `${s.room && s.room !== "No preference" ? s.room : "Stay"} for ${s.guests} guest(s), ${s.check_in} to ${s.check_out}`, details: { check_in_date: s.check_in, check_out_date: s.check_out, guests: s.guests, room: s.room, ...(s.rooms_wanted ? { rooms_wanted: s.rooms_wanted } : {}), ...(s.estimate ? { estimate_total: s.estimate, rooms_needed: s.rooms_needed } : {}) } });
          if (res.startsWith("error")) { st.step = "book"; s.waiting = "dates"; say("past_date"); return; }
          await tool("save_details", { check_in: s.check_in, check_out: s.check_out, guests: String(s.guests), interested_in: s.room });
          mem.booked = { in: s.check_in, out: s.check_out, guests: s.guests, room: s.room, at: now(), estimate: s.estimate, rooms: s.rooms_needed } as any; delete mem.dates; delete mem.guests;
          say("booking_sent"); st.step = undefined; st.slots = {}; return;
        }
        if (hasInfo) { const ack = absorb(true); out.debug.route = "changed a detail"; return bookStep(ack ? ack.replace("Noted", "Updated") : ""); }   // "no, 3 people not 2" / "change dates to 4 jan" keeps everything else
        if (yn === "no") { st.step = "book_edit"; await askButtons(R.ask_edit, ["Dates", "Guests", "Room"]); return; }
        if (await sideTurn()) return bookStep();
        say("yes_no_prompt"); return bookStep();
      }
      case "book_edit": {
        const hasInfo = !!(exNow.check_in || exNow.check_out || exNow.nights || exNow.guests || exNow.rooms || U.rooms.length);
        if (hasInfo) { const ack = absorb(true); return bookStep(ack ? ack.replace("Noted", "Updated") : ""); }
        if (/\b(dates?|day|days|check in|check out|when|nights?)\b/.test(t)) { delete s.check_in; delete s.check_out; delete s.nights; return bookStep(); }
        if (/\b(guests?|people|persons?|members?|adults?|kids?)\b/.test(t)) { delete s.guests; delete s.kids; delete s.adults; return bookStep(); }
        if (/\b(room|rooms|stay|villa|tent|type)\b/.test(t)) { delete s.room; return bookStep(); }
        await askButtons(R.ask_edit, ["Dates", "Guests", "Room"]); return;
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

  /** A lone 1–5 right after we asked for feedback is a rating, not a head-count. */
  async function ratingReply(): Promise<boolean> {
    const m = /^(?:rating\s*)?([1-5])(?:\s*(?:stars?|\/\s*5|out of 5))?$/.exec(t);
    if (!m || !contactId || dry) return false;
    const asked = get<any>("SELECT created_at FROM messages WHERE contact_id=? AND direction='out' AND template_name='resort_review_request' ORDER BY created_at DESC LIMIT 1", contactId);
    if (!asked || now() - asked.created_at > 7 * 864e5) return false;
    if (get("SELECT 1 FROM events WHERE contact_id=? AND name='guest_rated' AND created_at > ?", contactId, asked.created_at)) return false;
    const rating = Number(m[1]);
    const c = get<any>("SELECT phone, tags, attrs FROM contacts WHERE id=?", contactId)!;
    run("UPDATE contacts SET tags=?, attrs=? WHERE id=?", JSON.stringify([...new Set([...JSON.parse(c.tags), `rated-${rating}`])]), JSON.stringify({ ...JSON.parse(c.attrs), last_rating: String(rating) }), contactId);
    ingestEvent(ws, { name: "guest_rated", phone: c.phone, payload: { rating } });
    if (rating >= 4) {
      say("rating_high");
      if (biz.google_review_url) await tool("send_link", { body: R.rating_review_cta, label: "Leave a review", url: biz.google_review_url });
    } else {
      await tool("create_request", { kind: "complaint", summary: `Guest rated their stay ${rating}/5`, details: { rating } });
      await handoff(`Guest rated ${rating}/5`); say("rating_low");
    }
    return true;
  }

  async function roomsList(offerBooking = false) {
    if (!rooms.length) { const k = mem.booked ? `I've noted ${dateSummary(mem.booked)}. ` : mem.dates ? `I've noted ${dateSummary({ ...mem.dates, guests: mem.guests })}. ` : ""; say("rooms_none", { known: k }); return; }
    const lines = rooms.map((p) => `• *${p.name}* — ${inr(p.price)}/night${p.weekend_price ? ` (${inr(p.weekend_price)} Fri–Sat)` : ""}\n  Sleeps ${p.capacity}${p.meal_plan ? ` · ${p.meal_plan}` : ""}${p.description ? `\n  ${p.description}` : ""}`).join("\n");
    emit(`${fill(R.rooms_header, base)}\n\n${lines}${R.rooms_footer ? `\n\n${fill(R.rooms_footer, base)}` : ""}`);
    if (offerBooking) await tool("quick_replies", { text: "Would you like to check availability?", options: ["Check availability", "Photos", "Talk to our team"] });
  }

  let inStep = false;
  /** Handles a message that isn't about the open booking question (photos, food, a person…). Returns whether it said anything. */
  async function sideTurn(): Promise<boolean> {
    const before = out.outputs.length; inStep = true;
    try { await freshMessage(); } finally { inStep = false; }
    return out.outputs.length > before;
  }
  async function freshMessage() {
    if (await ratingReply()) return;
    // price pushback: show the cheapest and offer a conversation about rates
    if (/\b(too )?(costly|expensive|mehnga|mahenga|pricey|too much|cheaper|sasta|sasti|lower|reduce|kam karo|discount)\b/.test(t) && rooms.length) {
      out.debug.route = "price pushback";
      const cheapest = [...rooms].sort((a, b) => a.price - b.price)[0];
      emit(`I understand! Our most affordable stay is the *${cheapest.name}* at ${inr(cheapest.price)}/night. Our rates also change with the season and the length of stay — tell me your dates and number of guests and I'll ask our team for the best rate we can offer.`);
      return;
    }
    // policy questions (advance, cancellation terms…) are answered from your knowledge when it has them
    if (/\b(advance|deposit|policy|free|how much|charges?|rules?|terms)\b/.test(t) && (U.question || U.qword || shortMsg || /\b(advance|deposit|policy)\b/.test(t)) && ["payment", "cancel"].includes(top?.intent ?? "")) {
      const kb = answerFromKnowledge(ws, (t.match(/\b(advance|deposit|policy|cancellation|cancel|refund|payment|free|charges?|rules?|terms)\b/g) ?? []).join(" ") || clean);
      if (kb) { out.debug.route = "answer found in your knowledge"; emit(kb); return; }
    }
    // changing an existing booking
    if (/\b(change|modify|reschedule|postpone|prepone|shift|extend)\b/.test(t) && /\b(booking|booked|reservation|dates?|date)\b/.test(t) && /\b(already|my|booked|existing)\b/.test(t)) {
      out.debug.route = "change existing booking";
      await tool("create_request", { kind: "callback", summary: `Change to an existing booking: ${text.slice(0, 160)}` });
      await handoff("Guest wants to change an existing booking");
      emit("Sure — I've asked our team to help change your booking. They'll reply here shortly with the options."); return;
    }
    // "what is the total?" after the request went out
    if (mem.booked?.estimate && now() - mem.booked.at < 864e5 && /\b(total|amount|how much|kitna|cost|price|estimate)\b/.test(t) && !U.rooms.length && !exNow.check_in) { out.debug.route = "total of the request"; emit(`For ${dateSummary(mem.booked as any)}, the estimate is ${inr(mem.booked.estimate)}${mem.booked.rooms && mem.booked.rooms > 1 ? ` (${mem.booked.rooms} rooms)` : ""}. Our team will confirm the final price.`); return; }
    // a "yes"/thanks right after the request was sent
    if (mem.booked && now() - mem.booked.at < 36e5 && yesNo(clean) === "yes" && !(exNow.check_in || exNow.guests)) { emit("Your request is with our team — they'll confirm availability and next steps right here shortly."); return; }
    // people and complaints come first
    if (/\b(refund|money back|paisa wapas|paise wapas)\b/.test(t)) { out.debug.route = "intent: refund"; await tool("create_request", { kind: "complaint", summary: `Refund question: ${text.slice(0, 160)}` }); await handoff("Guest asked about a refund"); emit("I've passed your refund question to our team — they'll reply here shortly."); return; }
    if (top?.intent === "complaint") { out.debug.route = "intent: complaint"; await tool("create_request", { kind: "complaint", summary: text.slice(0, 200) }); await handoff("Guest is unhappy: " + text.slice(0, 120)); say("complaint"); return; }
    if (top?.intent === "human") { out.debug.route = "intent: human"; await handoff("Guest asked to speak to a person"); say("human"); return; }
    if (top?.intent === "callback") { out.debug.route = "intent: callback"; await tool("create_request", { kind: "callback", summary: "Guest asked for a call back", details: { note: text.slice(0, 200) } }); say("callback_ack"); return; }
    if (top?.intent === "cancel" && /\b(policy|rules?|terms|charges?|charge|fee|how much|kitna|conditions?)\b/.test(t)) {
      out.debug.route = "cancellation policy";
      const kb = answerFromKnowledge(ws, "cancellation policy refund");
      if (kb) { emit(kb); return; }
      await handoff("Guest asked about the cancellation policy"); emit("Our cancellation terms depend on the dates and rate — I've asked our team to share them with you here."); return;
    }
    if (top?.intent === "cancel") {
      out.debug.route = "intent: cancel";
      const stays = contactId ? listStays(ws, contactId).filter((x) => x.status === "upcoming") : [];
      if (!stays.length) { await handoff("Guest wants to cancel but no booking was found"); say("cancel_none"); return; }
      if (stays.length === 1) { st.slots = { cancel: stays[0].booking_id, check_in: stays[0].check_in, check_out: stays[0].check_out }; st.step = "cancel_confirm"; say("cancel_confirm", { booking_id: stays[0].booking_id }); await tool("quick_replies", { text: "Please confirm", options: ["Yes, cancel", "No, keep it"] }); return; }
      st.step = "cancel_pick"; say("cancel_pick");
      await tool("send_menu", { body: R.cancel_pick, button: "Bookings", options: stays.slice(0, 10).map((x) => ({ title: x.booking_id, description: `${x.check_in} → ${x.check_out}` })) }); return;
    }
    // "I already told you the dates"
    if (/\b(already|told|said|mentioned|earlier|above|before)\b/.test(t) && (mem.booked || mem.dates)) {
      out.debug.route = "reminding what they said";
      const b = mem.booked ?? { ...mem.dates!, guests: mem.guests };
      say("already_told", { summary: dateSummary(b as any) }); return;
    }
    // remember what they've told us so far, so later questions can use it
    if (exNow.guests) mem.guests = exNow.guests;
    if (exNow.check_in && exNow.check_out) mem.dates = { in: exNow.check_in, out: exNow.check_out };
    if (U.budget) mem.budget = U.budget;
    if (/\b(status|confirmed|confirmation|booking id|my booking|booking details|my reservation)\b/.test(t) && !/\bcancel/.test(t)) { out.debug.route = "intent: status"; const r = await tool("my_bookings", {}); if (/Stays: none/.test(r) && /Requests: none/.test(r)) say("status_none"); else say("status_list", { list: r }); return; }
    if (/\b(payment|pay link|payment link|advance|upi|pay now|how to pay)\b/.test(t) && top?.intent === "payment") { out.debug.route = "intent: payment"; const r = await tool("my_bookings", {}); const rid = r.match(/rq_[\w-]+/)?.[0]; if (rid) { const pp = await tool("send_payment_link", { request_id: rid }); if (!pp.startsWith("error")) return; } await handoff("Guest asked about payment"); say("human"); return; }
    const wantsStay0 = U.wantsBook || top?.intent === "booking" || (top?.intent === "rooms" && !!(exNow.check_in || exNow.guests || exNow.nights || exNow.rooms)) || (!!exNow.check_in && !!(exNow.check_out || exNow.nights || exNow.guests));
    const ans = await collectAnswers();
    const bareSlots = !ans.text && !top && !U.question && !U.qword && !!(exNow.guests || exNow.check_in || exNow.nights || exNow.rooms);
    const wantsStay = !inStep && ((wantsStay0 && !(ans.kind === "kb" && !U.wantsBook && !exNow.check_in && !exNow.guests)) || bareSlots);
    if (ans.text) {
      emit(hello + ans.text);
      if (ans.asset) await tool("send_file", { label: ans.asset });
      st.misses = 0;
    }
    if (wantsStay || (U.q.availability && exNow.check_in && rooms.length)) {
      if (!ans.text && top?.intent === "rooms") await roomsList();
      st.slots = { waiting: undefined };
      if (refRooms.length === 1 && (U.wantsBook || U.refersBack)) st.slots.room = refRooms[0].name;
      if (mem.guests && !exNow.guests) st.slots.guests = mem.guests;
      if (mem.dates && !exNow.check_in) { st.slots.check_in = mem.dates.in; st.slots.check_out = mem.dates.out; }
      const ack = absorb();
      if (!out.debug.route) out.debug.route = "booking";
      return bookStep(ans.text ? "" : ack);
    }
    if (ans.text) {
      if (ans.kind === "room" || ans.kind === "recommend") await tool("quick_replies", { text: "Would you like to check availability?", options: ["Check availability", "Photos", "Talk to our team"] });
      return;
    }
    if (!out.debug.route && top) out.debug.route = `intent: ${top.intent}`;
    if (top?.intent === "rooms") return roomsList(true);
    if (top?.intent === "status") {
      const r = await tool("my_bookings", {});
      if (/Stays: none/.test(r) && /Requests: none/.test(r)) { say("status_none"); return; }
      say("status_list", { list: r }); return;
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
      const r = await tool("send_location", {});          // sends the map pin or link when one is set up
      if (base.address) say("location_text"); else if (r.startsWith("error")) say("location_none");
      return;
    }
    if (top?.intent === "timings") {
      if (/late|early/.test(t)) { await tool("create_request", { kind: "service", summary: `Timing request: ${text.slice(0, 150)}` }); say("service_ack", { service: /arriv|reach/.test(t) ? "your late arrival" : /late/.test(t) ? "late check-out" : "early check-in" }); return; }
      say("checkin_times"); return;
    }
    if (top?.intent === "service") {
      const names: [RegExp, string][] = [[/(pick ?up|transfer|taxi|cab|airport)/, "airport pickup / transfer"], [/(extra bed|cot)/, "an extra bed / cot"], [/(decorat|cake|surprise|candle|bonfire)/, "a special arrangement"], [/(safari|jeep)/, "a safari"], [/(spa|massage)/, "spa / massage"], [/laundry/, "laundry"]];
      const svc = names.find(([re]) => re.test(t))?.[1] ?? "your request";
      await tool("create_request", { kind: "service", summary: `${svc}: ${text.slice(0, 160)}`, details: { service: svc, message: text.slice(0, 200), ...(exNow.check_in ? { date: exNow.check_in } : {}) } });
      say("service_ack", { service: svc }); return;
    }
    if (top?.intent === "payment") { const r = await tool("my_bookings", {}); const rid = r.match(/rq_[\w-]+/)?.[0]; if (rid) { const p = await tool("send_payment_link", { request_id: rid }); if (!p.startsWith("error")) return; } await handoff("Guest asked about payment"); say("human"); return; }
    if (top?.intent === "thanks") { if (inStep) return; say("thanks"); return; }
    if (top?.intent === "bye") { say("bye"); return; }
    if ((top?.intent === "menu" && /^(main )?menu$|^options?$|^help$|^start( over)?$|^home$|what can you do/.test(t)) || top?.intent === "greeting") { await greetMenu(); return; }

    // nothing matched: offer the menu, then a person
    if (inStep && (U.question || U.qword)) { if (!dry) recordMiss(ws, text); emit("I don't have that detail handy — I've noted it for our team. Meanwhile, let's finish your booking."); return; }
    if (inStep) { st.misses += 1; if (st.misses >= 2) { await handoff("The hotel bot couldn't understand the guest twice"); say("unknown_handoff"); } else emit("Sorry, I didn't catch that. " + (st.step === "book_confirm" ? "Shall I send your request to our team?" : "")); return; }
    st.misses += 1;
    if (o.deferUnknown) { out.unknown = true; return; }
    if (inStep) return;
    out.unknown = true; out.debug.route = "not understood";
    if (!dry) recordMiss(ws, text);
    if (st.misses >= 2) { await handoff("The hotel bot couldn't understand the guest twice"); say("unknown_handoff"); return; }
    await askMenu(`${R.unknown}\n\n${R.menu_body}`, "Choose", MENU);
  }

  // ---- main flow ----
  if (st.step) {
    // an open question (dates, confirmation…) gets the next answer, unless the guest clearly wants something else
    const escape = (top && ["human", "complaint", "menu"].includes(top.intent)) || (top?.intent === "cancel" && !st.step.startsWith("cancel"));
    if (!escape) { await continueStep(); return finish(); }
    st.step = undefined; st.slots = {}; out.debug.route = "";
  }
  await freshMessage();
  return finish();
}
void id; void money;
