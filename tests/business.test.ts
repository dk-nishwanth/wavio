import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { all, get, id, now, run } from "../lib/db";
import { makeTemplate, makeWorkspace } from "./helpers";
import { receiveInbound, upsertContact } from "../lib/core";
import { createOrder } from "../lib/orders";
import { createPaymentLink, markPaid, activeProvider } from "../lib/payments";
import { assertCan, createInvoice, markInvoicePaid, workspacePlan, effectivePlan } from "../lib/billing";
import { setStage, touchLead, listLeads, temperature } from "../lib/crm";
import { recordStay, listStays, cancelStay } from "../lib/stays";
import { saveIndustry, stagesFor, getIndustry } from "../lib/industry";
import { installResortPack } from "../lib/starter";
import { execFlow, startFlow, resumeWaiting, runCancelled } from "../lib/flow";
import { processDue } from "../lib/queue";
import { backupNow } from "../lib/backup";
import { addDays, isoToday } from "../lib/dates";

let ws: string;
beforeAll(() => { ({ ws } = makeWorkspace()); makeTemplate(ws, "t1", "Hi {{1}}"); });

describe("orders and payments (test checkout)", () => {
  it("creates an order, a payment link, and marks it paid exactly once", async () => {
    const c = upsertContact(ws, { phone: "919100000001", name: "Ravi", optedIn: true });
    run("INSERT INTO products (id, workspace_id, name, price, created_at) VALUES ('p1',?,?,?,?)", ws, "Tent", 1000, now());
    const o = createOrder(ws, c.id, [{ product_id: "p1", qty: 2 }]);
    expect(o.total).toBe(2000);
    expect(activeProvider(ws)).toBe("test");
    expect(await createPaymentLink(o.id)).toContain(`/pay/${o.id}`);
    markPaid(o.id, "r1"); markPaid(o.id, "r1");
    expect(get<any>("SELECT status FROM orders WHERE id=?", o.id)!.status).toBe("paid");
    expect(all("SELECT 1 FROM events WHERE name='payment_completed' AND contact_id=?", c.id).length).toBe(1);
    expect(get<any>("SELECT stage FROM leads WHERE contact_id=?", c.id)!.stage).toBe("won");
  });
  it("rejects empty orders and unknown products", () => {
    const c = upsertContact(ws, { phone: "919100000002", optedIn: true });
    expect(() => createOrder(ws, c.id, [])).toThrow();
    expect(() => createOrder(ws, c.id, [{ product_id: "nope" }])).toThrow(/not found/);
  });
});

describe("CRM", () => {
  it("scores engaged leads higher and maps score to temperature", () => {
    expect(temperature(10)).toBe("new"); expect(temperature(35)).toBe("warm"); expect(temperature(70)).toBe("hot");
    for (const t of ["a", "b", "c", "d", "e"]) receiveInbound(ws, { phone: "919100000010", name: "Hot" }, { type: "text", text: t });
    const l = listLeads(ws).find((x) => x.phone === "919100000010")!;
    expect(l.score).toBeGreaterThanOrEqual(30);
  });
  it("rejects unknown stages and logs real ones", () => {
    const c = get<any>("SELECT id FROM contacts WHERE phone='919100000010' AND workspace_id=?", ws)!;
    expect(() => setStage(ws, c.id, "bogus")).toThrow();
    setStage(ws, c.id, "qualified");
    expect(get<any>("SELECT stage FROM leads WHERE contact_id=?", c.id)!.stage).toBe("qualified");
    expect(all("SELECT 1 FROM activities WHERE contact_id=? AND kind='stage'", c.id).length).toBeGreaterThan(0);
  });
  it("uses resort wording once the business is a resort", () => {
    expect(stagesFor(ws)[0].label).toBe("New");
    saveIndustry(ws, "resort", { name: "Jawai Retreat" });
    expect(getIndustry(ws)).toBe("resort");
    expect(stagesFor(ws)[0].label).toBe("Enquiry");
  });
});

describe("billing and plan limits", () => {
  it("starts on a Pro trial and falls back to Basic limits when it lapses", () => {
    const p = workspacePlan(ws);
    expect(p.trial).toBe(true); expect(p.plan).toBe("pro");
    run("UPDATE workspaces SET created_at=? WHERE id=?", now() - 20 * 864e5, ws);
    expect(effectivePlan(ws).name).toBe("Basic");
  });
  it("enforces seats and flow counts on Basic", () => {
    expect(() => assertCan(ws, "seat")).toThrow(/1 user/);
    run("INSERT INTO automations (id, workspace_id, name, trigger_type, steps, graph, created_at) VALUES ('g1',?,'a','keyword','[]','{}',?),('g2',?,'b','keyword','[]','{}',?)", ws, now(), ws, now());
    expect(() => assertCan(ws, "flow")).toThrow(/2 flows/);
    expect(() => assertCan(ws, "schedule")).toThrow(/Starter/);
  });
  it("activates a paid plan once and stacks renewals", () => {
    const inv = createInvoice(ws, "starter", "monthly", 0, { state: "Telangana" });
    markInvoicePaid(inv); markInvoicePaid(inv);
    const p = workspacePlan(ws);
    expect(p.plan).toBe("starter"); expect(p.active).toBe(true);
    const until1 = p.until!;
    markInvoicePaid(createInvoice(ws, "starter", "monthly", 0, {}));
    expect(workspacePlan(ws).until!).toBeGreaterThan(until1 + 29 * 864e5);
    expect(() => assertCan(ws, "schedule")).not.toThrow();
    const row = get<any>("SELECT base, gst, total FROM invoices WHERE id=?", inv)!;
    expect(row.total).toBeCloseTo(row.base + row.gst, 2);
  });
});

describe("resort stay journey", () => {
  const stayDates = () => ({ in: addDays(isoToday(), 10), out: addDays(isoToday(), 12) });
  it("records a stay, sends the confirmation and schedules a reminder", async () => {
    await installResortPack(ws);
    const c = upsertContact(ws, { phone: "919100000020", name: "Aarav", optedIn: true });
    receiveInbound(ws, { phone: c.phone }, { type: "text", text: "hi" });
    run("UPDATE automations SET active=0 WHERE name='Resort enquiry bot' AND workspace_id=?", ws);
    const d = stayDates();
    const p = recordStay(ws, c.id, { check_in_date: d.in, check_out_date: d.out, guests: 3 });
    await processDue();
    expect(all("SELECT 1 FROM messages WHERE contact_id=? AND template_name='resort_booking_confirmed'", c.id).length).toBe(1);
    const pending = all<any>("SELECT payload FROM jobs WHERE status='pending' AND type='flow_step'").map((j) => JSON.parse(j.payload));
    expect(pending.some((j) => j.cancelEvent === "booking_cancelled")).toBe(true);
    expect(listStays(ws, c.id)[0].status).toBe("upcoming");
    cancelStay(ws, c.id, p.booking_id);
    expect(listStays(ws, c.id)[0].status).toBe("cancelled");
    const job = all<any>("SELECT payload FROM jobs WHERE status='pending' AND type='flow_step'").map((j) => JSON.parse(j.payload)).find((j) => j.cancelEvent);
    expect(runCancelled(job.runId, "booking_cancelled")).toBe(true);
  });
  it("validates stay dates", () => {
    const c = get<any>("SELECT id FROM contacts WHERE phone='919100000020' AND workspace_id=?", ws)!;
    expect(() => recordStay(ws, c.id, { check_in_date: "2026-12-20", check_out_date: "2026-12-19" })).toThrow(/after/);
    expect(() => recordStay(ws, c.id, { check_in_date: "20 Dec", check_out_date: "22 Dec" })).toThrow(/YYYY-MM-DD/);
  });
});

describe("chatbot flow engine", () => {
  it("branches on a button reply, captures an answer and saves it to the contact", async () => {
    const nodes = [
      { id: "t", type: "trigger", x: 0, y: 0, data: {} },
      { id: "b", type: "buttons", x: 0, y: 0, data: { text: "Pick", buttons: ["Sales", "Support"] } },
      { id: "q", type: "ask", x: 0, y: 0, data: { text: "Email?", variable: "email", save_to_contact: true } },
      { id: "m", type: "send_text", x: 0, y: 0, data: { text: "Thanks {{vars.email}}" } },
      { id: "h", type: "handoff", x: 0, y: 0, data: {} },
    ];
    const edges = [
      { id: "1", from: "t", port: "out", to: "b" }, { id: "2", from: "b", port: "0", to: "q" },
      { id: "3", from: "q", port: "out", to: "m" }, { id: "4", from: "b", port: "1", to: "h" },
    ];
    const aid = id("a_");
    run("INSERT INTO automations (id, workspace_id, name, trigger_type, trigger_value, steps, graph, active, created_at) VALUES (?,?,?,?,?,?,?,?,?)", aid, ws, "menu", "keyword", "menu", "[]", JSON.stringify({ nodes, edges }), 1, now());
    const c = upsertContact(ws, { phone: "919100000030", name: "Kiran", optedIn: true });
    receiveInbound(ws, { phone: c.phone }, { type: "text", text: "random" }); // opens the 24h window
    const a = get<any>("SELECT * FROM automations WHERE id=?", aid)!;
    startFlow(a, c.id, { text: "menu" }); await processDue();
    expect(await resumeWaiting(ws, c.id, "Sales")).toBe(true); await processDue();
    expect(await resumeWaiting(ws, c.id, "kiran@x.com")).toBe(true); await processDue();
    const out = all<any>("SELECT body FROM messages WHERE contact_id=? AND direction='out' ORDER BY created_at", c.id).map((m) => m.body);
    expect(out).toEqual(expect.arrayContaining(["Pick", "Email?", "Thanks kiran@x.com"]));
    expect(JSON.parse(get<any>("SELECT attrs FROM contacts WHERE id=?", c.id)!.attrs).email).toBe("kiran@x.com");
  });
  it("ignores unrelated messages while no button matches (so keyword triggers still run)", async () => {
    const c = upsertContact(ws, { phone: "919100000031", name: "Z", optedIn: true });
    expect(await resumeWaiting(ws, c.id, "anything")).toBe(false);
  });
});

describe("backups", () => {
  it("writes a verified snapshot and prunes old ones", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wavio-bk-"));
    process.env.BACKUP_DIR = dir; process.env.BACKUP_KEEP = "2";
    for (const n of ["200001010000", "200001010001", "200001010002"]) fs.writeFileSync(path.join(dir, `wavio-${n}.db`), "x");
    const file = backupNow();
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.startsWith("wavio-")).length).toBe(2);
    expect(fs.statSync(file).size).toBeGreaterThan(1000);
  });
});
