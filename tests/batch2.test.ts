import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SMTPServer } from "smtp-server";
import type { AddressInfo } from "node:net";
import { all, get, id, now, run } from "../lib/db";
import { makeWorkspace } from "./helpers";
import { csvCell, toCsv } from "../lib/csv";
import { alertCfg, buildDigest, maybeSendDigest, notifyAdmins, saveAlertCfg, sendAlert } from "../lib/alerts";
import { createRequest } from "../lib/requests";
import { receiveInbound, upsertContact } from "../lib/core";
import { recordStay } from "../lib/stays";
import { buildReport } from "../lib/reports";
import { resetTestData } from "../lib/reset";
import { handleGuest } from "../lib/hotelbot";
import { saveIndustry } from "../lib/industry";
import { addDays, isoToday } from "../lib/dates";
import { processDue } from "../lib/queue";
import { queueText } from "../lib/core";

let ws: string, smtp: SMTPServer, port: number; const mails: { subject: string; text: string; to: string }[] = [];
beforeAll(async () => {
  ({ ws } = makeWorkspace());
  saveIndustry(ws, "resort", { name: "Jawai Retreat" });
  smtp = new SMTPServer({ authOptional: true, disabledCommands: ["STARTTLS"], onData(stream, _s, cb) { let raw = ""; stream.on("data", (c) => (raw += c)); stream.on("end", () => { mails.push({ subject: /Subject: (.*)/.exec(raw)?.[1] ?? "", text: raw, to: /To: (.*)/.exec(raw)?.[1] ?? "" }); cb(); }); } });
  await new Promise<void>((r) => smtp.listen(0, "127.0.0.1", r));
  port = (smtp.server.address() as AddressInfo).port;
});
afterAll(() => { smtp.close(); vi.unstubAllGlobals(); });

describe("CSV exports", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(csvCell('Rao, "Asha"')).toBe('"Rao, ""Asha"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
  });
  it("neutralises spreadsheet formulas planted in a guest's name", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)"]) expect(csvCell(evil).startsWith("'") || csvCell(evil).startsWith('"\'')).toBe(true);
  });
  it("leaves real phone numbers alone", () => {
    expect(csvCell("+919876543210")).toBe("+919876543210");
    expect(csvCell("+1+1")).toBe("'+1+1");
  });
  it("starts with a BOM so Excel reads Hindi names correctly", () => {
    const out = toCsv(["Name"], [["आशा"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toContain("आशा");
  });
});

describe("alerts", () => {
  it("emails every recipient through the configured server", async () => {
    saveAlertCfg(ws, { email: { host: "127.0.0.1", port, from: "Wavio <alerts@jawai.test>", to: ["owner@jawai.test", "manager@jawai.test"] } });
    const r = await sendAlert(ws, { title: "Test alert", body: "Hello from the resort" });
    expect(r).toEqual([{ channel: "email", ok: true }]);
    expect(mails.length).toBe(1);
    expect(mails[0].subject).toBe("Test alert");
    expect(mails[0].text).toContain("Hello from the resort");
    expect(mails[0].to).toContain("manager@jawai.test");
  });
  it("reports a mail server that is down instead of throwing", async () => {
    saveAlertCfg(ws, { email: { host: "127.0.0.1", port: 1, from: "a@b.test", to: ["x@y.test"] } });
    const r = await sendAlert(ws, { title: "t", body: "b" });
    expect(r[0].ok).toBe(false); expect(r[0].error).toBeTruthy();
    saveAlertCfg(ws, { email: { host: "127.0.0.1", port, from: "Wavio <alerts@jawai.test>", to: ["owner@jawai.test"] } });
  });
  it("sends Telegram messages and surfaces Telegram's own error text", async () => {
    const calls: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify(calls.length === 1 ? { ok: true } : { ok: false, description: "chat not found" }), { status: calls.length === 1 ? 200 : 400 }); });
    saveAlertCfg(ws, { telegram: { bot_token: "123:abc", chat_id: "999" } });
    expect((await sendAlert(ws, { title: "Hi", body: "There" }))[0]).toEqual({ channel: "telegram", ok: true });
    expect(calls[0].url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(calls[0].body).toMatchObject({ chat_id: "999", text: "Hi\n\nThere" });
    expect((await sendAlert(ws, { title: "Hi", body: "There" }))[0]).toMatchObject({ ok: false, error: "chat not found" });
    vi.unstubAllGlobals();
    saveAlertCfg(ws, { email: { host: "127.0.0.1", port, from: "Wavio <alerts@jawai.test>", to: ["owner@jawai.test"] } });
  });
  it("queues an alert when a request needs a person, and respects the switches", async () => {
    run("DELETE FROM jobs WHERE type='alert'");
    const c = upsertContact(ws, { phone: "919500000001", name: "Asha Rao", optedIn: true });
    createRequest(ws, c.id, { kind: "booking", summary: "Safari tent for 2", details: { check_in_date: "2027-01-10", check_out_date: "2027-01-12", guests: 2, room: "Safari Tent" } });
    const job = get<any>("SELECT payload FROM jobs WHERE type='alert'")!;
    expect(JSON.parse(job.payload)).toMatchObject({ title: "New booking request from Asha Rao (+919500000001)" });
    expect(JSON.parse(job.payload).body).toContain("2027-01-10 → 2027-01-12, 2 guests, Safari Tent");
    const before = mails.length;
    await processDue(200);
    expect(mails.length).toBe(before + 1);
    run("DELETE FROM jobs WHERE type='alert'");
    saveAlertCfg(ws, { ...alertCfg(ws), on: { requests: false } });
    notifyAdmins(ws, "request", { title: "x", body: "y" });
    expect(all("SELECT 1 FROM jobs WHERE type='alert'").length).toBe(0);
    saveAlertCfg(ws, { ...alertCfg(ws), on: {} });
  });
  it("builds a morning summary and sends it once a day", async () => {
    const c = upsertContact(ws, { phone: "919500000002", name: "Ravi", optedIn: true });
    recordStay(ws, c.id, { check_in_date: isoToday(), check_out_date: addDays(isoToday(), 2), guests: 3, room: "Pool Villa" });
    const d = buildDigest(ws);
    expect(d.title).toContain("Jawai Retreat — morning summary");
    expect(d.body).toContain("Arriving today (1)");
    expect(d.body).toContain("Ravi — Pool Villa, 3 guests");
    expect(d.body).toContain("Waiting for your decision (1)");
    expect(await maybeSendDigest(ws, new Date(new Date().setHours(5, 0, 0, 0)))).toBe(false);   // too early
    const before = mails.length;
    expect(await maybeSendDigest(ws, new Date(new Date().setHours(9, 0, 0, 0)))).toBe(true);
    expect(await maybeSendDigest(ws, new Date(new Date().setHours(10, 0, 0, 0)))).toBe(false);  // already sent today
    expect(mails.length).toBe(before + 1);
  });
});

describe("reports", () => {
  it("measures who answered, how fast, and how guests rated", () => {
    const w2 = makeWorkspace("Reports").ws, t0 = now() - 3600_000; saveIndustry(w2, "resort");
    const guestMsg = (phone: string, at: number) => { receiveInbound(w2, { phone }, { type: "text", text: "hello" }); const c = get<any>("SELECT id FROM contacts WHERE workspace_id=? AND phone=?", w2, phone)!; run("UPDATE messages SET created_at=? WHERE contact_id=?", at, c.id); return c; };
    const reply = (cid: string, at: number, by: { ai?: number; user?: string }) => run("INSERT INTO messages (id, workspace_id, conversation_id, contact_id, direction, type, body, status, ai, sent_by, created_at) SELECT ?,?,id,?,?,?,?,?,?,?,? FROM conversations WHERE contact_id=?", id("m_"), w2, cid, "out", "text", "reply", "sent", by.ai ?? 0, by.user ?? null, at, cid);
    const a = guestMsg("919600000001", t0), b = guestMsg("919600000002", t0), c = guestMsg("919600000003", t0);
    reply(a.id, t0 + 4000, { ai: 1 });                 // bot alone, 4 s
    reply(b.id, t0 + 6000, { ai: 1 }); reply(b.id, t0 + 600_000, { user: "u1" });   // bot then a person
    reply(c.id, t0 + 120_000, { user: "u1" });         // person, 2 min
    run("INSERT INTO events (id, workspace_id, contact_id, name, payload, created_at) VALUES (?,?,?,?,?,?),(?,?,?,?,?,?)", id("e_"), w2, a.id, "guest_rated", '{"rating":5}', now(), id("e_"), w2, b.id, "guest_rated", '{"rating":3}', now());
    createRequest(w2, b.id, { kind: "handoff", summary: "needs a person" });
    const r = buildReport(w2, 7);
    expect(r.current.activeGuests).toBe(3);
    expect(r.current.botAloneGuests).toBe(1);
    expect(r.current.handedToTeam).toBe(1);
    expect(r.responseTimes.botN).toBe(2); expect(r.responseTimes.botMedianMs).toBe(5000);
    expect(r.responseTimes.teamN).toBe(1); expect(r.responseTimes.teamMedianMs).toBe(120_000);
    expect(r.current.ratingAvg).toBe(4); expect(r.current.ratingCount).toBe(2);
    expect(r.hours.reduce((x: number, y: number) => x + y, 0)).toBe(3);
    expect(r.pipeline.map((p: any) => p.stage)).toContain("Enquiry");
  });
});

describe("clearing test data", () => {
  it("removes guests and activity but keeps the setup", () => {
    const w3 = makeWorkspace("Reset").ws;
    run("INSERT INTO products (id, workspace_id, name, price, created_at) VALUES ('rp',?,?,?,?)", w3, "Tent", 1000, now());
    run("INSERT INTO bot_faqs (id, workspace_id, keywords, answer, hits, created_at) VALUES ('rf',?,?,?,?,?)", w3, "wifi", "Free", 7, now());
    receiveInbound(w3, { phone: "919700000001" }, { type: "text", text: "hi" });
    const c = get<any>("SELECT id FROM contacts WHERE workspace_id=?", w3)!;
    createRequest(w3, c.id, { kind: "service", summary: "pickup" });
    const counts = resetTestData(w3);
    expect(counts.contacts).toBe(1); expect(counts.requests).toBe(1);
    for (const t of ["contacts", "messages", "conversations", "leads", "requests", "events"]) expect(all(`SELECT 1 FROM ${t} WHERE workspace_id=?`, w3).length, t).toBe(0);
    expect(all("SELECT 1 FROM products WHERE workspace_id=?", w3).length).toBe(1);
    expect(get<any>("SELECT hits FROM bot_faqs WHERE id='rf'")!.hits).toBe(0);
    expect(all("SELECT 1 FROM bot_state WHERE contact_id=?", c.id).length).toBe(0);
  });
});

describe("the Test page's pretend guest", () => {
  it("never reaches WhatsApp: replies are marked sent locally", async () => {
    const c = upsertContact(ws, { phone: "10000000001", name: "Test Guest", tags: ["test-guest"], optedIn: true });
    receiveInbound(ws, { phone: "10000000001" }, { type: "text", text: "hi" });
    const mid = queueText(ws, c.id, "Hello from the bot", { ai: true });
    await processDue(500);
    const m = get<any>("SELECT status, wa_message_id FROM messages WHERE id=?", mid)!;
    expect(m.status).toBe("sent"); expect(m.wa_message_id).toBe("test_" + mid);
  });
  it("shows what the bot understood and what it sent, in order", async () => {
    saveIndustry(ws, "resort", { name: "Jawai Retreat", address: "Jawai Dam Road" });
    run("INSERT INTO products (id, workspace_id, name, price, created_at) VALUES ('tp',?,?,?,?)", ws, "Safari Tent", 12000, now());
    const r = await handleGuest(ws, null, "pls tell rates for 20dec", { dry: true });
    expect(r.debug).toMatchObject({ route: "booking", clean: "please tell rates for 20 dec" });
    expect(r.debug.intents[0].intent).toBe("rooms");
    expect(r.debug.dates.check_in).toMatch(/-12-20$/);
    expect(r.outputs.map((o) => (o.type === "text" ? "text" : o.tool))).toEqual(["text", "text"]); // the rates, then "which nights / how many guests?"
    const plain = await handleGuest(ws, null, "pls tell rates", { dry: true });
    expect(plain.outputs.map((o) => (o.type === "text" ? "text" : o.tool))).toEqual(["text", "quick_replies"]);
    const u = await handleGuest(ws, null, "blorp zzz flarn", { dry: true });
    expect(u.debug.route).toBe("not understood");
  });
});
