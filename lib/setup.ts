import { all, get, id, now, run } from "./db";
import { getBusiness, getIndustry } from "./industry";
import { aiConfigured } from "./llm";
import { getAgent } from "./ai";
import { waConfig, isMock } from "./wa";
import { clearVocabCache } from "./fuzzy";

/** The questions hotel guests ask most. Keywords are what the bot listens for; the admin supplies the answer. */
export const FAQ_TEMPLATES: { key: string; question: string; keywords: string; hint: string }[] = [
  { key: "wifi", question: "Do you have Wi-Fi?", keywords: "wifi, internet, wi-fi", hint: "Free Wi-Fi in every room and the lounge." },
  { key: "parking", question: "Is there parking?", keywords: "parking, park my car, car park", hint: "Free parking for all guests." },
  { key: "pets", question: "Are pets allowed?", keywords: "pets, pet, dog, dogs", hint: "Pets are welcome with prior notice; extra cleaning fee applies." },
  { key: "food", question: "What food do you serve?", keywords: "food, meals, restaurant, veg, vegetarian, jain, non veg, menu", hint: "Vegetarian and non-vegetarian food, Jain on request. Breakfast included." },
  { key: "kids", question: "Can we bring kids? Extra bed?", keywords: "kids policy, child policy, extra bed, extra mattress, infant, baby cot", hint: "Children under 5 stay free; an extra bed costs ₹…" },
  { key: "pool", question: "Pool timings?", keywords: "pool, swimming, swimming pool", hint: "The pool is open from 7 AM to 7 PM." },
  { key: "cancellation", question: "What is the cancellation policy?", keywords: "cancellation policy, refund policy, cancel policy, cancellation charges", hint: "Free cancellation up to 7 days before arrival; after that …" },
  { key: "payment", question: "How do I pay? Advance?", keywords: "advance payment, how to pay, payment mode, upi, advance amount, deposit", hint: "30% advance to confirm; balance at check-in. UPI, cards and bank transfer accepted." },
  { key: "pickup", question: "Airport / station pickup and distance?", keywords: "airport, railway station, how far, distance, nearest station, pickup charges", hint: "Nearest airport is … (about … km). Pickup is available for ₹…" },
  { key: "attractions", question: "What is there to do nearby?", keywords: "nearby, attractions, things to do, places to visit, sightseeing", hint: "Leopard safari, lake visit, village walk, temples …" },
  { key: "activities", question: "Activities and safaris?", keywords: "activities, safari, jeep safari, bonfire, trek, bird watching", hint: "Jeep safari ₹… per person, bonfire evenings, guided walks …" },
  { key: "besttime", question: "Best time to visit?", keywords: "best time, which season, weather, climate", hint: "October to March is the best season; summers are hot but quiet." },
  { key: "id", question: "What ID is needed at check-in?", keywords: "id proof, identity proof, aadhaar, passport, documents, id required", hint: "A government photo ID (Aadhaar, passport, driving licence) for every guest." },
  { key: "alcohol", question: "Alcohol and smoking policy?", keywords: "alcohol, liquor, drinks, bar, smoking", hint: "Alcohol is served at our bar; smoking only in designated areas." },
  { key: "amenities", question: "What facilities are there? AC, power backup?", keywords: "amenities, facilities, ac, air conditioning, power backup, geyser, hot water", hint: "AC rooms, hot water 24×7, power backup, daily housekeeping." },
  { key: "groups", question: "Group / event / wedding bookings?", keywords: "wedding, event, party, corporate, group booking, large group", hint: "We host groups and events — our team will share a custom quote." },
  { key: "offers", question: "Any discounts or offers?", keywords: "discount, offer, offers, deal, deals, coupon", hint: "Current offers: … (or: please share your dates and our team will check the best rate)" },
  { key: "contact", question: "Contact number / who do I call?", keywords: "contact number, phone number, call you, reception number", hint: "Reception: +91 … (9 AM – 9 PM)" },
];

/** Creates or updates one FAQ per answered template. Blank answers are skipped, so running it twice never duplicates. */
export function saveSetupFaqs(ws: string, answers: Record<string, string>) {
  let saved = 0;
  for (const t of FAQ_TEMPLATES) {
    const a = String(answers[t.key] ?? "").trim();
    if (!a) continue;
    const row = get<any>("SELECT id FROM bot_faqs WHERE workspace_id=? AND keywords=?", ws, t.keywords);
    if (row) run("UPDATE bot_faqs SET answer=?, enabled=1 WHERE id=?", a.slice(0, 1500), row.id);
    else run("INSERT INTO bot_faqs (id, workspace_id, keywords, answer, created_at) VALUES (?,?,?,?,?)", id("faq_"), ws, t.keywords, a.slice(0, 1500), now());
    saved++;
  }
  clearVocabCache();
  return saved;
}

export const currentSetupAnswers = (ws: string) => Object.fromEntries(FAQ_TEMPLATES.map((t) => [t.key, get<any>("SELECT answer FROM bot_faqs WHERE workspace_id=? AND keywords=?", ws, t.keywords)?.answer ?? ""]));

/** What's done and what's left, for the checklist on Home and the Setup page. */
export function setupStatus(ws: string) {
  const b = getBusiness(ws);
  const steps = [
    { key: "business", title: "Tell us about the resort", done: !!(b.name && (b.address || b.maps_url) && b.phone), href: "/setup#resort" },
    { key: "rooms", title: "Add your rooms and rates", done: (get<any>("SELECT COUNT(*) n FROM products WHERE workspace_id=? AND active=1", ws)!.n as number) > 0, href: "/setup#rooms" },
    { key: "answers", title: "Teach it your common answers", done: (get<any>("SELECT COUNT(*) n FROM bot_faqs WHERE workspace_id=? AND enabled=1", ws)!.n as number) >= 3, href: "/setup#answers" },
    { key: "photos", title: "Upload photos and brochures", done: (get<any>("SELECT COUNT(*) n FROM assets WHERE workspace_id=?", ws)!.n as number) > 0, href: "/concierge" },
    { key: "bot", title: "Switch the bot on", done: !!(getAgent(ws).enabled && getAgent(ws).auto_reply), href: "/concierge" },
    { key: "whatsapp", title: "Connect WhatsApp", done: !isMock(waConfig(ws)), href: "/settings" },
  ];
  return { industry: getIndustry(ws), steps, done: steps.filter((s) => s.done).length, total: steps.length, aiConfigured: aiConfigured(ws), rooms: all<any>("SELECT * FROM products WHERE workspace_id=? ORDER BY price", ws) };
}
