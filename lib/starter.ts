import { get, id, now, run } from "./db";
import { submitTemplate, waConfig } from "./wa";
import { getBusiness, saveIndustry } from "./industry";
import type { FlowEdge, FlowNode } from "./flow";

const TEMPLATES = [
  { name: "resort_booking_confirmed", category: "UTILITY", body: "Hi {{1}}, your stay at {{2}} is confirmed! 🌿\nCheck-in: {{3}}\nCheck-out: {{4}}\nGuests: {{5}}\nWe can't wait to host you." },
  { name: "resort_checkin_reminder", category: "UTILITY", body: "Hi {{1}}, your stay at {{2}} begins in 2 days! Check-in is from {{3}}. Reply here if you'd like help with directions, pickup or special requests." },
  { name: "resort_review_request", category: "MARKETING", body: "Hi {{1}}, thank you for staying with us at {{2}}! We'd love to hear how it was. Reply with a rating from 1 to 5 — it means a lot to us." },
  { name: "resort_offer", category: "MARKETING", body: "Hi {{1}}, our {{2}} offer is live at {{3}}: {{4}}. Reply YES to know more." },
];

let seq = 0;
const nd = (type: string, x: number, y: number, data: Record<string, any>): FlowNode => ({ id: `${type}_${++seq}`, type, x, y, data });
const ed = (from: FlowNode, to: FlowNode, port = "out"): FlowEdge => ({ id: `e_${++seq}`, from: from.id, port, to: to.id });

function enquiryBot(name: string) {
  const t = nd("trigger", 40, 220, { trigger_type: "first_message", trigger_value: "" });
  const b = nd("buttons", 300, 200, { text: `Welcome to ${name}! 🌿 How can we help you today?`, buttons: ["Rooms & rates", "Packages", "Plan my stay"] });
  const rooms = nd("send_text", 600, 40, { text: "Our stays:\n• (add your room types and starting rates here)\n\nRates vary by season — share your dates and we'll send exact options." });
  const pack = nd("send_text", 600, 200, { text: "Our packages & experiences:\n• (add your packages, activities and meal plans here)" });
  const q1 = nd("ask", 880, 200, { text: "Which dates are you planning to visit? (e.g. 20 Dec - 23 Dec)", variable: "dates", save_to_contact: true });
  const q2 = nd("ask", 1160, 200, { text: "How many guests will be coming (adults and children)?", variable: "guests", save_to_contact: true });
  const tag = nd("tag", 1440, 200, { tag: "enquiry" });
  const stage = nd("set_stage", 1440, 340, { stage: "contacted" });
  const thanks = nd("send_text", 1160, 400, { text: "Thank you {{contact.name}}! Our team will share the best options for {{vars.dates}} ({{vars.guests}}) shortly." });
  const hand = nd("handoff", 880, 400, {});
  const nodes = [t, b, rooms, pack, q1, q2, tag, stage, thanks, hand];
  return { nodes, edges: [ed(t, b), ed(b, rooms, "0"), ed(b, pack, "1"), ed(b, q1, "2"), ed(rooms, q1), ed(pack, q1), ed(q1, q2), ed(q2, tag), ed(tag, stage), ed(stage, thanks), ed(thanks, hand)] };
}

function stayJourney(name: string, checkIn: string) {
  const t = nd("trigger", 40, 120, { trigger_type: "event", trigger_value: "booking_confirmed" });
  const conf = nd("send_template", 300, 100, { template: "resort_booking_confirmed", params: ["{{contact.name}}", "{{event.resort_name}}", "{{event.check_in}}", "{{event.check_out}}", "{{event.guests}}"] });
  const w1 = nd("wait_until", 560, 100, { date: "{{event.check_in_date}}", offset_days: -2, at_hour: 9, cancel_event: "booking_cancelled" });
  const rem = nd("send_template", 860, 60, { template: "resort_checkin_reminder", params: ["{{contact.name}}", "{{event.resort_name}}", "{{event.check_in_time}}"] });
  const w2 = nd("wait_until", 1140, 100, { date: "{{event.check_out_date}}", offset_days: 1, at_hour: 10, cancel_event: "booking_cancelled" });
  const rev = nd("send_template", 1440, 60, { template: "resort_review_request", params: ["{{contact.name}}", "{{event.resort_name}}"] });
  const tag = nd("tag", 1440, 240, { tag: "past-guest" });
  void name; void checkIn;
  return { nodes: [t, conf, w1, rem, w2, rev, tag], edges: [ed(t, conf), ed(conf, w1), ed(w1, rem, "ready"), ed(w1, w2, "late"), ed(rem, w2), ed(w2, rev, "ready"), ed(rev, tag)] };
}

/** Installs the resort templates and automations. Safe to run twice: existing items (by name) are left alone. */
export async function installResortPack(ws: string) {
  const biz = getBusiness(ws);
  saveIndustry(ws, "resort");
  const name = biz.name || "our resort";
  const created: string[] = [];
  for (const t of TEMPLATES) {
    if (get("SELECT 1 FROM templates WHERE workspace_id=? AND name=?", ws, t.name)) continue;
    const tid = id("t_");
    run("INSERT INTO templates (id, workspace_id, name, language, category, body, status, created_at) VALUES (?,?,?,?,?,?,?,?)", tid, ws, t.name, "en", t.category, t.body, "DRAFT", now());
    try { const r = await submitTemplate(waConfig(ws), { name: t.name, language: "en", category: t.category, body: t.body }); run("UPDATE templates SET status=?, meta_id=? WHERE id=?", r.status, r.id, tid); }
    catch { run("UPDATE templates SET status='REJECTED' WHERE id=?", tid); }
    created.push(`template ${t.name}`);
  }
  const add = (title: string, trigger_type: string, trigger_value: string, graph?: { nodes: FlowNode[]; edges: FlowEdge[] }, steps: object[] = []) => {
    if (get("SELECT 1 FROM automations WHERE workspace_id=? AND name=?", ws, title)) return;
    run("INSERT INTO automations (id, workspace_id, name, trigger_type, trigger_value, steps, graph, active, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      id("a_"), ws, title, trigger_type, trigger_value, JSON.stringify(steps), graph ? JSON.stringify(graph) : null, 1, now());
    created.push(`automation ${title}`);
  };
  add("Resort enquiry bot", "first_message", "", enquiryBot(name));
  add("Stay journey: confirmation, reminder, review", "event", "booking_confirmed", stayJourney(name, biz.check_in_time || "12:00 PM"));
  add("Rates quick reply", "keyword", "rates, price, tariff, cost", undefined, [
    { type: "send_text", text: "Thanks for your interest! Our rates start from ₹ (edit this in Automations). Share your dates and number of guests and we'll send exact options." },
    { type: "tag", tag: "interested" },
  ]);
  return created;
}
