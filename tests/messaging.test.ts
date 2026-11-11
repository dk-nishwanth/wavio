import { beforeAll, describe, expect, it } from "vitest";
import { all, get, id, now, run } from "../lib/db";
import { makeTemplate, makeWorkspace, sleep } from "./helpers";
import { queueTemplate, queueText, receiveInbound, upsertContact, ensureConversation, applyStatus } from "../lib/core";
import { processDue } from "../lib/queue";
import { ingestEvent } from "../lib/events";
import { hit, isBlocked } from "../lib/ratelimit";

let ws: string;
beforeAll(() => { ({ ws } = makeWorkspace()); makeTemplate(ws, "welcome", "Hi {{1}}!"); makeTemplate(ws, "draft_tpl", "x", "PENDING"); });

const contact = (phone: string, optedIn = true) => upsertContact(ws, { phone, name: "Guest", optedIn });

describe("inbound messages", () => {
  it("creates contact, conversation, lead and opts the sender in", () => {
    receiveInbound(ws, { phone: "919000000001", name: "Asha" }, { type: "text", text: "Hello" });
    const c = get<any>("SELECT * FROM contacts WHERE workspace_id=? AND phone=?", ws, "919000000001")!;
    expect(c.opted_in).toBe(1);
    expect(get("SELECT 1 FROM conversations WHERE contact_id=?", c.id)).toBeTruthy();
    expect(get<any>("SELECT stage FROM leads WHERE contact_id=?", c.id)?.stage).toBe("new");
  });
  it("ignores a webhook retry of the same WhatsApp message id", () => {
    const send = () => receiveInbound(ws, { phone: "919000000002" }, { waId: "wamid.dup", type: "text", text: "once" });
    send(); send();
    expect(all("SELECT 1 FROM messages WHERE wa_message_id='wamid.dup'").length).toBe(1);
  });
  it("STOP opts the contact out and START opts back in", () => {
    receiveInbound(ws, { phone: "919000000003" }, { type: "text", text: "hi" });
    receiveInbound(ws, { phone: "919000000003" }, { type: "text", text: "STOP" });
    const c = () => get<any>("SELECT opted_in FROM contacts WHERE phone='919000000003' AND workspace_id=?", ws)!.opted_in;
    expect(c()).toBe(0);
    receiveInbound(ws, { phone: "919000000003" }, { type: "text", text: "START" });
    expect(c()).toBe(1);
  });
});

describe("sending rules", () => {
  it("refuses free text outside the 24-hour window", () => {
    const c = contact("919000000010");
    ensureConversation(ws, c.id);
    expect(() => queueText(ws, c.id, "hello")).toThrow(/24-hour/);
  });
  it("allows free text inside the window", () => {
    receiveInbound(ws, { phone: "919000000011" }, { type: "text", text: "hi" });
    const c = get<any>("SELECT id FROM contacts WHERE phone='919000000011' AND workspace_id=?", ws)!;
    expect(queueText(ws, c.id, "reply")).toBeTruthy();
  });
  it("blocks messaging contacts who opted out", () => {
    const c = contact("919000000012", false);
    expect(() => queueTemplate(ws, c.id, "welcome", ["x"])).toThrow(/opted in/);
  });
  it("only sends APPROVED templates", () => {
    const c = contact("919000000013");
    expect(() => queueTemplate(ws, c.id, "draft_tpl")).toThrow(/PENDING/);
    expect(() => queueTemplate(ws, c.id, "nope")).toThrow(/not found/);
  });
  it("delivers queued templates through the worker and tracks status", async () => {
    const c = contact("919000000014");
    const mid = queueTemplate(ws, c.id, "welcome", ["Asha"]);
    await processDue();
    const m = get<any>("SELECT * FROM messages WHERE id=?", mid)!;
    expect(m.status).toBe("sent");
    expect(m.body).toBe("Hi Asha!");
    applyStatus(m.wa_message_id, "delivered");
    applyStatus(m.wa_message_id, "sent"); // late/out-of-order status must not go backwards
    expect(get<any>("SELECT status FROM messages WHERE id=?", mid)!.status).toBe("delivered");
  });
});

describe("events and automations", () => {
  it("fires an automation once per idempotency key", async () => {
    const aid = id("a_");
    run("INSERT INTO automations (id, workspace_id, name, trigger_type, trigger_value, steps, active, created_at) VALUES (?,?,?,?,?,?,?,?)",
      aid, ws, "order", "event", "order_placed", JSON.stringify([{ type: "send_template", template: "welcome", params: ["{{contact.name}}"] }]), 1, now());
    const c = contact("919000000020");
    const before = all("SELECT 1 FROM messages WHERE contact_id=?", c.id).length;
    expect(ingestEvent(ws, { name: "order_placed", phone: c.phone, idempotencyKey: "o1" })).toHaveProperty("id");
    expect(ingestEvent(ws, { name: "order_placed", phone: c.phone, idempotencyKey: "o1" })).toEqual({ duplicate: true });
    await processDue(); await processDue();
    expect(all("SELECT 1 FROM messages WHERE contact_id=?", c.id).length - before).toBe(1);
  });
  it("cancels a delayed step when the stopping event arrives", async () => {
    const aid = id("a_");
    run("INSERT INTO automations (id, workspace_id, name, trigger_type, trigger_value, steps, active, created_at) VALUES (?,?,?,?,?,?,?,?)",
      aid, ws, "cart", "event", "cart_updated", JSON.stringify([{ type: "wait", minutes: 0.001, unless_event: "order_done" }, { type: "send_template", template: "welcome", params: ["x"] }]), 1, now());
    const c = contact("919000000021");
    ingestEvent(ws, { name: "cart_updated", phone: c.phone });
    ingestEvent(ws, { name: "order_done", phone: c.phone });
    await processDue(); await sleep(150); await processDue();
    expect(all("SELECT 1 FROM messages WHERE contact_id=? AND type='template'", c.id).length).toBe(0);
  });
});

describe("rate limiting", () => {
  it("blocks after the limit and reports retry time", () => {
    const k = "t:" + Math.random();
    for (let i = 0; i < 3; i++) expect(hit(k, 3, 60_000).ok).toBe(true);
    const r = hit(k, 3, 60_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(isBlocked(k, 3)).toBe(true);
  });
});
