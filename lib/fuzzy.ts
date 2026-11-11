// Makes sense of how people really type on WhatsApp: SMS-speak, stretched words, spelling mistakes,
// Hinglish, number words. Everything here is a pure function so it can be tested exhaustively.

/** Edit distance (insert/delete/substitute/swap-neighbours), giving up early above `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [], prev: number[] = [], cur: number[] = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i; let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) { prev2[j] = prev[j]; prev[j] = cur[j]; }
  }
  return prev[b.length];
}

/** Common text-speak and Indian-English shortenings → the plain word. */
const SLANG: Record<string, string> = {
  pls: "please", plz: "please", plss: "please", pleaseee: "please", kindly: "please", pliz: "please", u: "you", ur: "your", r: "are", y: "why", wat: "what", wht: "what", whts: "whats", hw: "how", hv: "have", hav: "have",
  abt: "about", abut: "about", tmrw: "tomorrow", tmr: "tomorrow", tmrrw: "tomorrow", tomo: "tomorrow", "2moro": "tomorrow", "2morrow": "tomorrow", tomorow: "tomorrow", tomorro: "tomorrow", kal: "tomorrow", aaj: "today", "2day": "today", parso: "day after tomorrow", parson: "day after tomorrow",
  thx: "thanks", thnx: "thanks", tnx: "thanks", thanx: "thanks", thanku: "thanks", thankyou: "thanks", tq: "thanks", ty: "thanks", shukriya: "thanks", dhanyawad: "thanks", dhanyavad: "thanks",
  hlo: "hello", helo: "hello", hallo: "hello", hii: "hi", hiii: "hi", hy: "hi", heyy: "hey", gm: "good morning", gn: "good night", gud: "good", mrng: "morning", evng: "evening",
  rm: "room", rms: "rooms", rooom: "room", bkng: "booking", bkg: "booking", bking: "booking", bokking: "booking", boking: "booking", resrv: "reserve", avl: "available", avail: "available", availble: "available", avilable: "available", availabilty: "availability", availablity: "availability",
  chk: "check", chkin: "check in", chkout: "check out", cancl: "cancel", cncl: "cancel", cancle: "cancel", cancelation: "cancellation",
  n: "and", nd: "and", msg: "message", info: "information", dtls: "details", rqst: "request", req: "request", reqd: "required", rqd: "required",
  ppl: "people", peple: "people", persn: "person", pax: "people", adlt: "adult", adlts: "adults", adult: "adults", kid: "kids", chld: "child", chldrn: "children", bachhe: "kids", bachche: "kids", bacche: "kids", bache: "kids", baccha: "kids", bachha: "kids", log: "people", logon: "people", members: "people", member: "people",
  nt: "night", nts: "nights", nite: "night", nites: "nights", raat: "nights", raatein: "nights", din: "days", dino: "days",
  wid: "with", wit: "with", dis: "this", dat: "that", wen: "when", whn: "when", wher: "where", whr: "where", cn: "can", cud: "could", shud: "should", wud: "would", dnt: "dont", cant: "cant", wana: "want", wanna: "want", gonna: "going",
  b4: "before", bcz: "because", bcoz: "because", coz: "because", cuz: "because", frnd: "friend", frnds: "friends", gf: "friend", bf: "friend", fam: "family", trp: "trip",
  tarif: "tariff", tarrif: "tariff", tariffs: "tariff", rate: "rates", pricing: "price", prise: "price", rs: "rupees", inr: "rupees", rupee: "rupees", ruppees: "rupees", rupay: "rupees",
  locatn: "location", loc: "location", adress: "address", addres: "address", dirction: "directions", direction: "directions", mapp: "map",
  foto: "photo", fotos: "photos", pic: "photo", pics: "photos", pix: "photos", phto: "photo", phtos: "photos", pictuers: "pictures", imgs: "images", img: "image",
  ok: "ok", okk: "ok", okok: "ok", okey: "ok", okay: "ok", okie: "ok", k: "ok", kk: "ok", yup: "yes", yep: "yes", yea: "yes", yeah: "yes", ya: "yes", yaa: "yes", yess: "yes", haan: "yes", haa: "yes", han: "yes", hanji: "yes", haanji: "yes", ji: "",
  nahi: "no", nahin: "no", nai: "no", nope: "no", nah: "no", na: "no",
  sir: "", madam: "", mam: "", maam: "", sirji: "", bhai: "", bro: "", dear: "", team: "", hotel: "hotel", resort: "resort",
};
const SLANG_PHRASES: [RegExp, string][] = [
  [/\bcheck[\s-]?in\b/g, "check in"], [/\bcheck[\s-]?out\b/g, "check out"], [/\bwi[\s-]?fi\b/g, "wifi"], [/\bnon[\s-]?ac\b/g, "nonac"], [/\ba\.?\/?c\b/g, "ac"],
  [/\bday after tomorrow\b/g, "dayaftertomorrow"], [/\bwhat is\b/g, "whats"], [/\bwhat's\b/g, "whats"], [/\bdo the needful\b/g, "please help"], [/\bplease revert\b/g, "please reply"], [/\bkindly revert\b/g, "please reply"],
  [/\bmujhe\b/g, "i"], [/\bmere liye\b/g, "for me"], [/\bchahiye\b/g, "want"], [/\bchahie\b/g, "want"], [/\bchaiye\b/g, "want"], [/\bchahea\b/g, "want"], [/\bkarna hai\b/g, "want"], [/\bkarni hai\b/g, "want"], [/\bkaro\b/g, "do"], [/\bkardo\b/g, "do"],
];

const NUMWORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, cheh: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10, dus: 10, solo: 1, couple: 2,
};
const UNIT = "adults|kids|children|child|people|persons|person|guests|guest|nights|night|days|day|rooms|room|bachhe|log|raat|din";

/** Words that look like typos of domain words but aren't — never "corrected". */
const PROTECT = new Set("this that with from have what when where which would could should about their there these those some your mine ours them then than also just only very much many more most make made need needs want wants like look looking come coming going stay stays staying take taking give giving tell told ask asking send sent show shown know knew name help helps please thank thanks hello good best nice great fine free open close near next last first other another same each every both over under after before around between during through into onto upon without within".split(" "));
const COMMON_HINGLISH = new Set("kya hai hain ho hoga hogi kitna kitne kitni kab kaise kahan kaha kyun kyu mein main aur ya toh to bhi nahi mera meri mere aap aapka aapke hum hamara tum tumhara yeh ye woh wo isme usme liye saath sath karo karna karni kar raha rahe rahi chahiye batao bataiye bata dijiye dijie milega milegi mil sakta sakti".split(" "));

type Cache = { at: number; vocab: Set<string>; byFirst: Map<string, string[]> };
const cache = new Map<string, Cache>();

export function makeVocab(words: Iterable<string>): { vocab: Set<string>; byFirst: Map<string, string[]> } {
  const vocab = new Set<string>(); const byFirst = new Map<string, string[]>();
  for (const w of words) { const x = w.toLowerCase(); if (x.length < 3 || vocab.has(x)) continue; vocab.add(x); const k = x[0]; (byFirst.get(k) ?? byFirst.set(k, []).get(k)!).push(x); }
  return { vocab, byFirst };
}

/** Nearest known word for a misspelt one. Same first letter, small distance, and not ambiguous. */
const skeleton = (w: string) => w[0] + w.slice(1).replace(/[aeiou]/g, "");

export function nearest(token: string, v: { vocab: Set<string>; byFirst: Map<string, string[]> }): string | null {
  // people shorten words by dropping vowels: "tnt" → tent, "pls" → please, "frnd" → friend
  if (token.length >= 3 && token.length <= 6 && !/\d/.test(token) && !v.vocab.has(token) && !PROTECT.has(token) && !COMMON_HINGLISH.has(token) && !/[aeiou]/.test(token.slice(1))) {
    const hits = (v.byFirst.get(token[0]) ?? []).filter((c) => c.length > token.length && skeleton(c) === token);
    if (hits.length === 1) return hits[0];
  }
  if (token.length < 4 || v.vocab.has(token) || PROTECT.has(token) || COMMON_HINGLISH.has(token) || /\d/.test(token)) return null;
  const limit = token.length <= 5 ? 1 : token.length <= 8 ? 2 : 3;
  let best: string[] = [], bestD = limit + 1;
  for (const cand of v.byFirst.get(token[0]) ?? []) {
    const d = editDistance(token, cand, limit);
    if (d < bestD) { bestD = d; best = [cand]; } else if (d === bestD && d <= limit) best.push(cand);
  }
  if (bestD > limit || !best.length) return null;
  if (best.length > 1) { const same = best.filter((c) => c.length === token.length); if (same.length === 1) return same[0]; return null; } // ambiguous: leave as typed
  return best[0];
}

/**
 * Turns "hellooo pls tell rates 4 rooom 20dec 2 23 decmber for 4 ppl" into
 * "hello please tell rates 4 room 20 dec 2 23 december for 4 people": stretched letters collapsed, text-speak expanded,
 * misspellings fixed against `vocab`, number words turned into digits.
 */
export function normalizeMessage(text: string, v: { vocab: Set<string>; byFirst: Map<string, string[]> }): string {
  let t = String(text ?? "").toLowerCase().replace(/[’‘`´]/g, "'").replace(/[‍️]/g, "");
  t = t.replace(/(\p{L})\1{2,}/gu, "$1$1");                                  // hellooo → helloo
  for (const [re, rep] of SLANG_PHRASES) t = t.replace(re, rep);
  t = t.replace(/(\d)(st|nd|rd|th)\b/g, "$1");                                  // 20th → 20
  t = t.replace(/(\d)\s*n\b/g, "$1 nights");                                    // 3n → 3 nights
  t = t.replace(/(\d)([a-zऀ-ॿ])/g, "$1 $2").replace(/([a-zऀ-ॿ])(\d)/g, "$1 $2"); // 20dec → 20 dec
  const tokens = t.split(/[^\p{L}\p{N}']+/u).filter(Boolean).map((x) => x.replace(/'/g, ""));
  const out: string[] = [];
  for (let tok of tokens) {
    if (tok in SLANG) tok = SLANG[tok];
    else if (!v.vocab.has(tok)) { const fix = nearest(tok, v); if (fix) tok = fix; }
    else if (tok in SLANG) tok = SLANG[tok];
    if (tok === "") continue;
    out.push(tok);
  }
  let s = out.join(" ").replace(/\bdayaftertomorrow\b/g, "day after tomorrow");
  // number words next to a unit or after "of/are": "four adults", "family of five", "teen log"
  s = s.replace(new RegExp(`\\b(${Object.keys(NUMWORDS).join("|")})\\b(?=\\s+(?:${UNIT})\\b)`, "g"), (_, w) => String(NUMWORDS[w]));
  s = s.replace(/\b(of|are|hum|we)\s+(one|two|three|four|five|six|seven|eight|nine|ten|ek|teen|char|chaar|paanch|panch|saat|aath|nau|das)\b/g, (_, a, w) => `${a} ${NUMWORDS[w]}`);
  s = s.replace(/\bcouple\b/g, "2 people");
  return s.replace(/\s+/g, " ").trim();
}

export function cachedVocab(key: string, build: () => Iterable<string>, ttlMs = 30_000) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit;
  const v = makeVocab(build()); const entry = { at: Date.now(), ...v };
  cache.set(key, entry); return entry;
}
export const clearVocabCache = () => cache.clear();
