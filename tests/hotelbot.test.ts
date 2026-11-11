import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { all, get, id, now, run } from "../lib/db";
import { makeWorkspace } from "./helpers";
import { addText } from "../lib/kb";
import { saveIndustry } from "../lib/industry";
import { addDays, isoToday, parseDateRange, parseGuests } from "../lib/dates";
import { answerFromKnowledge, detectIntents, handleGuest, saveReplies, DEFAULT_REPLIES } from "../lib/hotelbot";
import { receiveInbound } from "../lib/core";
import { recordStay } from "../lib/stays";
import { answerInbound, getAgent } from "../lib/ai";
import { saveMetaCfg, metaCfg } from "../lib/metaleads";
import { processDue } from "../lib/queue";

let ws: string;
const label = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return `${d.getUTCDate()} ${["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][d.getUTCMonth()]}`; };
const D1 = addDays(isoToday(), 40), D2 = addDays(isoToday(), 43);

function guest(phone: string, text = "hi") {
  receiveInbound(ws, { phone, name: "Asha Rao" }, { type: "text", text });
  const c = get<any>("SELECT * FROM contacts WHERE workspace_id=? AND phone=?", ws, phone)!;
  run("UPDATE conversations SET bot_paused=0 WHERE contact_id=?", c.id);
  run("DELETE FROM jobs WHERE type='ai_reply'");
  return c;
}
const say = async (c: any, text: string) => (await handleGuest(ws, c.id, text));
const sent = (cid: string) => all<any>("SELECT type, body FROM messages WHERE contact_id=? AND direction='out' ORDER BY created_at, rowid", cid);
const texts = (cid: string) => sent(cid).map((m) => m.body);

beforeAll(() => {
  ({ ws } = makeWorkspace());
  saveIndustry(ws, "resort", { name: "Jawai Retreat", address: "Jawai Dam Road, Rajasthan", latitude: 25.1, longitude: 73.2, check_in_time: "12:00 PM", check_out_time: "11:00 AM" });
  run("INSERT INTO products (id, workspace_id, name, price, description, created_at) VALUES ('p1',?,?,?,?,?),('p2',?,?,?,?,?)", ws, "Safari Tent", 12000, "Sleeps 3, breakfast included", now(), ws, "Pool Villa", 25000, "Sleeps 6, private pool", now());
  addText(ws, "Facilities", "Pets are welcome at the retreat with prior notice. There is free parking for all guests. Our restaurant serves vegetarian and Jain food.");
  run("INSERT INTO assets (id, workspace_id, path, mime, name, kind, label, created_at) VALUES ('as1',?,?,?,?,?,?,?)", ws, `${ws}/a.png`, "image/png", "a.png", "image", "Safari tent photos", now());
  run("INSERT INTO assets (id, workspace_id, path, mime, name, kind, label, created_at) VALUES ('as2',?,?,?,?,?,?,?)", ws, `${ws}/b.png`, "image/png", "b.png", "image", "Pool villa photos", now());
});

describe("understanding", () => {
  it("detects hotel intents in English, Hinglish and Hindi", () => {
    const top = (t: string) => detectIntents(t)[0]?.intent;
    expect(top("hello")).toBe("greeting");
    expect(top("What are your room rates?")).toBe("rooms");
    expect(top("rates kitna hai")).toBe("rooms");
    expect(top("रेट क्या है")).toBe("rooms");
    expect(top("नमस्ते")).toBe("greeting");
    expect(top("I want to book a room")).toBe("booking");
    expect(top("please cancel my booking")).toBe("cancel");
    expect(top("where are you located? send the map")).toBe("location");
    expect(top("can I get photos")).toBe("photos");
    expect(top("I need airport pickup")).toBe("service");
    expect(top("let me talk to a manager")).toBe("human");
    expect(top("this is the worst service")).toBe("complaint");
    expect(top("what time is check in")).toBe("timings");
  });
  it("only treats a short message as a greeting", () => {
    expect(detectIntents("hello can you tell me about the pool and spa treatments you offer")[0]?.intent).not.toBe("greeting");
  });
  it("parses stays and guests", () => {
    expect(parseDateRange(`${label(D1)} to ${label(D2)}`)).toMatchObject({ check_in: D1, check_out: D2, nights: 3 });
    expect(parseGuests("2 adults and 2 kids")).toBe(4);
  });
  it("answers from the knowledge base only when it really matches", () => {
    expect(answerFromKnowledge(ws, "do you allow pets?")).toMatch(/Pets are welcome/);
    expect(answerFromKnowledge(ws, "is there parking")).toMatch(/free parking/);
    expect(answerFromKnowledge(ws, "tell me about quantum computing")).toBeNull();
  });
});

describe("conversations (no AI involved)", () => {
  it("greets by name and offers the menu", async () => {
    const c = guest("919300000001", "hello");
    const r = await say(c, "hello");
    expect(r.replies[0]).toBe("Hello Asha! Welcome to Jawai Retreat 🌿 How can I help you today?");
    expect(sent(c.id).map((m) => m.type)).toEqual(["text", "list"]);
  });
  it("shows rooms and rates straight from the catalog", async () => {
    const c = guest("919300000002");
    const r = await say(c, "what are your rates?");
    expect(r.replies[0]).toContain("*Safari Tent* — ₹12,000/night");
    expect(r.replies[0]).toContain("*Pool Villa* — ₹25,000/night");
    expect(sent(c.id).map((m) => m.type)).toContain("buttons");
  });
  it("takes a booking step by step and sends it to the team for approval", async () => {
    const c = guest("919300000003");
    expect((await say(c, "I want to book a room")).replies[0]).toMatch(/Which dates/);
    expect((await say(c, `${label(D1)} to ${label(D2)}`)).replies[0]).toMatch(/How many guests/);
    const r3 = await say(c, "4 people");
    expect(r3.state.step).toBe("book_room");
    expect(sent(c.id).some((m) => m.type === "list")).toBe(true);
    const r4 = await say(c, "Pool Villa");
    expect(r4.state.step).toBe("book_confirm");
    expect(r4.replies[0]).toContain("4 guests");
    expect(r4.replies[0]).toContain("Pool Villa");
    const r5 = await say(c, "yes");
    expect(r5.replies[0]).toMatch(/sent your request to our team/);
    const req = get<any>("SELECT * FROM requests WHERE contact_id=?", c.id)!;
    expect(req.kind).toBe("booking"); expect(req.status).toBe("open");
    expect(JSON.parse(req.details)).toMatchObject({ check_in_date: D1, check_out_date: D2, guests: 4, room: "Pool Villa" });
    expect(get<any>("SELECT step FROM bot_state WHERE contact_id=?", c.id)!.step).toBeNull();
  });
  it("jumps ahead when the guest gives everything in one message", async () => {
    const c = guest("919300000004");
    const r = await say(c, `Need a room for 2 adults from ${label(D1)} to ${label(D2)}`);
    expect(r.state.step).toBe("book_room");
    expect(r.state.slots).toMatchObject({ check_in: D1, check_out: D2, guests: 2 });
  });
  it("lets the guest change their mind and start over", async () => {
    const c = guest("919300000005");
    await say(c, `book ${label(D1)} to ${label(D2)}`); await say(c, "3 guests"); await say(c, "Safari Tent");
    const r = await say(c, "no");
    expect(r.replies[0]).toMatch(/start again/);
    expect(r.state.slots).toEqual({});
  });
  it("asks again when the date has passed", async () => {
    const c = guest("919300000006");
    const r = await say(c, "book 2 jan 2020 to 4 jan 2020");
    expect(r.replies.join(" ")).toMatch(/already passed|Which dates|upcoming/);
  });
  it("can be interrupted: asking for a person mid-booking hands over", async () => {
    const c = guest("919300000007");
    await say(c, "I want to book");
    const r = await say(c, "actually let me talk to a manager");
    expect(r.handoff).toBe(true);
    expect(get<any>("SELECT bot_paused FROM conversations WHERE contact_id=?", c.id)!.bot_paused).toBe(1);
  });
  it("cancels a recorded stay after confirmation", async () => {
    const c = guest("919300000008");
    const stay = recordStay(ws, c.id, { check_in_date: D1, check_out_date: D2, guests: 2 });
    const r1 = await say(c, "I need to cancel my booking");
    expect(r1.replies[0]).toContain(stay.booking_id);
    const r2 = await say(c, "yes");
    expect(r2.replies[0]).toMatch(/cancellation/);
    expect(JSON.parse(get<any>("SELECT details FROM requests WHERE contact_id=? AND kind='cancellation'", c.id)!.details).booking_id).toBe(stay.booking_id);
  });
  it("hands over when there is nothing to cancel", async () => {
    const c = guest("919300000009");
    const r = await say(c, "cancel my booking");
    expect(r.handoff).toBe(true);
  });
  it("logs service requests for the team", async () => {
    const c = guest("919300000010");
    const r = await say(c, "Can you arrange airport pickup for us?");
    expect(r.replies[0]).toMatch(/airport pickup/);
    expect(get<any>("SELECT kind, summary FROM requests WHERE contact_id=?", c.id)).toMatchObject({ kind: "service" });
  });
  it("treats complaints seriously", async () => {
    const c = guest("919300000011");
    const r = await say(c, "this is the worst experience, I am very unhappy");
    expect(r.handoff).toBe(true);
    expect(all<any>("SELECT kind FROM requests WHERE contact_id=?", c.id).map((x) => x.kind).sort()).toEqual(["complaint", "handoff"]);
  });
  it("sends the location, check-in times and photos", async () => {
    const c = guest("919300000012");
    await say(c, "how do I reach you? send location");
    expect(sent(c.id).some((m) => m.type === "location")).toBe(true);
    expect((await say(c, "what time is check in?")).replies[0]).toBe("Check-in is from 12:00 PM and check-out is by 11:00 AM. Early check-in or late check-out can be requested — just ask!");
    await say(c, "show me photos of the pool villa");
    expect(sent(c.id).filter((m) => m.type === "image").length).toBe(1);
  });
  it("uses the questions and answers the admin taught it (and tags the photo)", async () => {
    run("INSERT INTO bot_faqs (id, workspace_id, keywords, answer, asset_label, created_at) VALUES ('f1',?,?,?,?,?)", ws, "wifi, internet", "Free fast Wi-Fi in every room and the lounge.", "Safari tent photos", now());
    const c = guest("919300000013");
    const r = await say(c, "do you have wifi?");
    expect(r.replies[0]).toBe("Free fast Wi-Fi in every room and the lounge.");
    expect(sent(c.id).some((m) => m.type === "image")).toBe(true);
    expect(get<any>("SELECT hits FROM bot_faqs WHERE id='f1'")!.hits).toBe(1);
  });
  it("falls back to the knowledge base, then the menu, then a person", async () => {
    const c = guest("919300000014");
    expect((await say(c, "are pets allowed?")).replies.join(" ")).toMatch(/Pets are welcome/);
    const r1 = await say(c, "blorp flarn zzz");
    expect(r1.unknown).toBe(true); expect(r1.replies[0]).toMatch(/not sure I understood/);
    const r2 = await say(c, "glorp snarf yyy");
    expect(r2.handoff).toBe(true);
  });
  it("uses the admin's edited wording", async () => {
    saveReplies(ws, { thanks: "Anytime, {resort} is always here for you!" });
    const c = guest("919300000015");
    expect((await say(c, "thank you")).replies[0]).toBe("Anytime, Jawai Retreat is always here for you!");
    saveReplies(ws, {});
    expect((await say(c, "thank you")).replies[0]).toBe(DEFAULT_REPLIES.thanks);
  });
  it("defers to the AI when asked to (hybrid) instead of replying 'I don't understand'", async () => {
    const c = guest("919300000016");
    const r = await handleGuest(ws, c.id, "blorp flarn zzz", { deferUnknown: true });
    expect(r.unknown).toBe(true);
    expect(r.replies).toEqual([]);
  });
});

describe("playground and engine wiring", () => {
  it("runs without touching the database, carrying state between turns", async () => {
    const before = [all("SELECT 1 FROM messages").length, all("SELECT 1 FROM requests").length, all("SELECT 1 FROM bot_state").length];
    let state: any;
    let r = await handleGuest(ws, null, "I want to book", { dry: true, state });
    r = await handleGuest(ws, null, `${label(D1)} to ${label(D2)}`, { dry: true, state: r.state });
    r = await handleGuest(ws, null, "2 guests", { dry: true, state: r.state });
    r = await handleGuest(ws, null, "Safari Tent", { dry: true, state: r.state });
    r = await handleGuest(ws, null, "yes", { dry: true, state: r.state });
    expect(r.replies[0]).toMatch(/sent your request/);
    expect(r.steps.some((s) => s.tool === "create_request")).toBe(true);
    expect([all("SELECT 1 FROM messages").length, all("SELECT 1 FROM requests").length, all("SELECT 1 FROM bot_state").length]).toEqual(before);
  });
  it("answers real guests through the worker when the engine is the hotel bot — no AI key needed", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const cfg = metaCfg(ws) as any; delete cfg.ai_key; saveMetaCfg(ws, cfg);
    getAgent(ws); run("UPDATE ai_agents SET enabled=1, auto_reply=1, engine='rules' WHERE workspace_id=?", ws);
    run("DELETE FROM automations WHERE workspace_id=?", ws);
    receiveInbound(ws, { phone: "919300000020", name: "Meera" }, { type: "text", text: "what are the rates?" });
    await new Promise((r) => setTimeout(r, 30));
    run("UPDATE jobs SET run_at=? WHERE type='ai_reply'", now() - 1);
    await processDue(500);
    const c = get<any>("SELECT id FROM contacts WHERE phone='919300000020' AND workspace_id=?", ws)!;
    expect(texts(c.id).join(" ")).toContain("Safari Tent");
    const m = get<any>("SELECT ai FROM messages WHERE contact_id=? AND direction='out'", c.id)!;
    expect(m.ai).toBe(1);
  });
  it("stays silent when switched off", async () => {
    run("UPDATE ai_agents SET enabled=0 WHERE workspace_id=?", ws);
    receiveInbound(ws, { phone: "919300000021" }, { type: "text", text: "rates please" });
    const c = get<any>("SELECT id FROM contacts WHERE phone='919300000021' AND workspace_id=?", ws)!;
    const m = get<any>("SELECT id FROM messages WHERE contact_id=?", c.id)!;
    await answerInbound(ws, c.id, m.id);
    expect(sent(c.id).length).toBe(0);
    run("UPDATE ai_agents SET enabled=1 WHERE workspace_id=?", ws);
  });
});
void id;
