import crypto from "node:crypto";
import { all, get, id, now, run } from "./db";
import { HttpError } from "./auth";
import { enqueue } from "./queue";
import * as wa from "./wa";
import { startAutomations } from "./automation";

export const WINDOW_MS = 24 * 3600 * 1000;

/** Digits only. A bare 10-digit number is assumed to be Indian (+91). */
export function normalizePhone(p: string) {
  const d = String(p).replace(/[^\d]/g, "");
  if (d.length === 10) return "91" + d;
  if (d.length < 8 || d.length > 15) throw new HttpError(400, `Invalid phone number: ${p}`);
  return d;
}

export type Contact = {
  id: string; workspace_id: string; phone: string; name: string | null; email: string | null;
  attrs: string; tags: string; opted_in: number; created_at: number;
};

export function upsertContact(
  ws: string,
  c: { phone: string; name?: string | null; email?: string | null; attrs?: object; tags?: string[]; optedIn?: boolean },
): Contact {
  const phone = normalizePhone(c.phone);
  const ex = get<Contact>("SELECT * FROM contacts WHERE workspace_id=? AND phone=?", ws, phone);
  if (ex) {
    const attrs = { ...JSON.parse(ex.attrs), ...(c.attrs ?? {}) };
    const tags = [...new Set([...JSON.parse(ex.tags), ...(c.tags ?? [])])];
    run(
      "UPDATE contacts SET name=COALESCE(?,name), email=COALESCE(?,email), attrs=?, tags=?, opted_in=COALESCE(?,opted_in) WHERE id=?",
      c.name ?? null, c.email ?? null, JSON.stringify(attrs), JSON.stringify(tags),
      c.optedIn === undefined ? null : c.optedIn ? 1 : 0, ex.id,
    );
    return get<Contact>("SELECT * FROM contacts WHERE id=?", ex.id)!;
  }
  const cid = id("c_");
  run(
    "INSERT INTO contacts (id, workspace_id, phone, name, email, attrs, tags, opted_in, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    cid, ws, phone, c.name ?? null, c.email ?? null, JSON.stringify(c.attrs ?? {}), JSON.stringify(c.tags ?? []),
    c.optedIn ? 1 : 0, now(),
  );
  return get<Contact>("SELECT * FROM contacts WHERE id=?", cid)!;
}

export function ensureConversation(ws: string, contactId: string) {
  let conv = get<any>("SELECT * FROM conversations WHERE contact_id=?", contactId);
  if (!conv) {
    const cid = id("cv_");
    run("INSERT INTO conversations (id, workspace_id, contact_id) VALUES (?,?,?)", cid, ws, contactId);
    conv = get<any>("SELECT * FROM conversations WHERE id=?", cid);
  }
  return conv;
}

export function windowOpen(conv: { last_inbound_at: number | null }) {
  return !!conv.last_inbound_at && now() - conv.last_inbound_at < WINDOW_MS;
}

export const renderTemplate = (body: string, params: string[]) =>
  body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");

function touchConversation(convId: string, preview: string, inbound: boolean) {
  run(
    `UPDATE conversations SET last_message_at=?, last_preview=?, unread = unread + ?, last_inbound_at = COALESCE(?, last_inbound_at),
     status = CASE WHEN ? THEN 'open' ELSE status END WHERE id=?`,
    now(), preview.slice(0, 120), inbound ? 1 : 0, inbound ? now() : null, inbound ? 1 : 0, convId,
  );
}

type QueueOpts = { campaignId?: string; runAt?: number; note?: boolean; manual?: boolean };

/** Creates the message row and queues delivery. Free-form text is only allowed inside the 24h window. */
export function queueText(ws: string, contactId: string, text: string, o: QueueOpts = {}) {
  const contact = get<Contact>("SELECT * FROM contacts WHERE id=? AND workspace_id=?", contactId, ws);
  if (!contact) throw new HttpError(404, "Contact not found");
  const conv = ensureConversation(ws, contactId);
  const mid = id("m_");
  if (o.note) {
    run(
      "INSERT INTO messages (id, workspace_id, conversation_id, contact_id, direction, type, body, status, is_note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      mid, ws, conv.id, contactId, "out", "note", text, "sent", 1, now(),
    );
    return mid;
  }
  if (!contact.opted_in) throw new HttpError(409, "Contact has opted out");
  if (!windowOpen(conv)) throw new HttpError(409, "Outside the 24-hour window — send an approved template instead");
  run(
    "INSERT INTO messages (id, workspace_id, conversation_id, contact_id, direction, type, body, status, campaign_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    mid, ws, conv.id, contactId, "out", "text", text, "queued", o.campaignId ?? null, now(),
  );
  if (o.manual) run("UPDATE conversations SET bot_paused=1 WHERE id=?", conv.id);
  touchConversation(conv.id, text, false);
  enqueue("send_message", { messageId: mid }, { workspaceId: ws, runAt: o.runAt });
  return mid;
}

export function queueTemplate(ws: string, contactId: string, templateName: string, params: string[] = [], o: QueueOpts = {}) {
  const contact = get<Contact>("SELECT * FROM contacts WHERE id=? AND workspace_id=?", contactId, ws);
  if (!contact) throw new HttpError(404, "Contact not found");
  if (!contact.opted_in) throw new HttpError(409, "Contact has not opted in");
  const tpl = get<any>("SELECT * FROM templates WHERE workspace_id=? AND name=?", ws, templateName);
  if (!tpl) throw new HttpError(404, `Template "${templateName}" not found`);
  if (tpl.status !== "APPROVED") throw new HttpError(409, `Template "${templateName}" is ${tpl.status}, not APPROVED`);
  const conv = ensureConversation(ws, contactId);
  const mid = id("m_");
  const body = renderTemplate(tpl.body, params);
  run(
    "INSERT INTO messages (id, workspace_id, conversation_id, contact_id, direction, type, body, template_name, params, status, campaign_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    mid, ws, conv.id, contactId, "out", "template", body, tpl.name, JSON.stringify(params), "queued", o.campaignId ?? null, now(),
  );
  touchConversation(conv.id, body, false);
  enqueue("send_message", { messageId: mid }, { workspaceId: ws, runAt: o.runAt });
  return mid;
}

export function queueButtons(ws: string, contactId: string, text: string, buttons: string[]) {
  const conv = ensureConversation(ws, contactId);
  if (!windowOpen(conv)) throw Object.assign(new HttpError(409, "Outside the 24-hour window"), { permanent: true });
  const mid = id("m_");
  run(
    "INSERT INTO messages (id, workspace_id, conversation_id, contact_id, direction, type, body, params, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    mid, ws, conv.id, contactId, "out", "buttons", text, JSON.stringify(buttons), "queued", now(),
  );
  touchConversation(conv.id, text, false);
  enqueue("send_message", { messageId: mid }, { workspaceId: ws });
  return mid;
}

/** Job handler: actually calls WhatsApp. */
export async function deliverMessage(messageId: string) {
  const m = get<any>("SELECT * FROM messages WHERE id=?", messageId);
  if (!m || m.status === "sent" || m.status === "delivered" || m.status === "read") return;
  const contact = get<Contact>("SELECT * FROM contacts WHERE id=?", m.contact_id)!;
  const cfg = wa.waConfig(m.workspace_id);
  try {
    if (!contact.opted_in) throw Object.assign(new Error("Contact opted out"), { permanent: true });
    let waId: string;
    const params = m.params ? JSON.parse(m.params) : [];
    if (m.type === "template") {
      const tpl = get<any>("SELECT language FROM templates WHERE workspace_id=? AND name=?", m.workspace_id, m.template_name);
      waId = await wa.sendTemplate(cfg, contact.phone, m.template_name, tpl?.language ?? "en", params);
    } else if (m.type === "buttons") {
      waId = await wa.sendInteractiveButtons(cfg, contact.phone, m.body, params);
    } else {
      waId = await wa.sendText(cfg, contact.phone, m.body);
    }
    run("UPDATE messages SET status='sent', wa_message_id=?, error=NULL WHERE id=?", waId, messageId);
    emitWebhook(m.workspace_id, "message.sent", { messageId, contactId: m.contact_id });
  } catch (e: any) {
    const permanent = e?.permanent ?? false;
    run("UPDATE messages SET error=?, status=? WHERE id=?", String(e.message).slice(0, 300), permanent ? "failed" : "queued", messageId);
    if (permanent) emitWebhook(m.workspace_id, "message.failed", { messageId, error: e.message });
    throw e;
  }
}

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

export function applyStatus(waId: string, status: string, error?: string) {
  const m = get<any>("SELECT * FROM messages WHERE wa_message_id=?", waId);
  if (!m) return;
  if (status !== "failed" && (RANK[status] ?? 0) <= (RANK[m.status] ?? 0)) return;
  run("UPDATE messages SET status=?, error=COALESCE(?,error) WHERE id=?", status, error ?? null, m.id);
  emitWebhook(m.workspace_id, `message.${status}`, { messageId: m.id, contactId: m.contact_id, error });
}

/** Store an inbound message and fire automations. Called from the Meta webhook and the dev simulator. */
export function receiveInbound(
  ws: string,
  from: { phone: string; name?: string },
  msg: { waId?: string; type: string; text: string },
) {
  if (msg.waId && get("SELECT 1 FROM messages WHERE wa_message_id=?", msg.waId)) return; // Meta retries webhooks
  const isNew = !get("SELECT 1 FROM contacts WHERE workspace_id=? AND phone=?", ws, normalizePhone(from.phone));
  const contact = upsertContact(ws, { phone: from.phone, name: from.name, optedIn: undefined });
  // a customer messaging you is an opt-in unless they previously opted out
  if (isNew) run("UPDATE contacts SET opted_in=1 WHERE id=?", contact.id);
  const conv = ensureConversation(ws, contact.id);
  const firstEver = !get("SELECT 1 FROM messages WHERE conversation_id=? AND direction='in'", conv.id);
  const mid = id("m_");
  run(
    "INSERT INTO messages (id, workspace_id, conversation_id, contact_id, direction, type, body, wa_message_id, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    mid, ws, conv.id, contact.id, "in", msg.type, msg.text, msg.waId ?? null, "received", now(),
  );
  touchConversation(conv.id, msg.text, true);
  emitWebhook(ws, "message.received", { messageId: mid, contactId: contact.id, phone: contact.phone, text: msg.text });

  const t = msg.text.trim().toLowerCase();
  if (["stop", "unsubscribe", "stop all"].includes(t)) {
    run("UPDATE contacts SET opted_in=0 WHERE id=?", contact.id);
    return;
  }
  if (["start", "subscribe"].includes(t)) run("UPDATE contacts SET opted_in=1 WHERE id=?", contact.id);
  if (conv.bot_paused) return;
  startAutomations(ws, contact.id, "keyword", { text: msg.text });
  if (firstEver) startAutomations(ws, contact.id, "first_message", { text: msg.text });
}

// ---- outbound webhooks ----

export function emitWebhook(ws: string, event: string, data: object) {
  for (const h of all<any>("SELECT id FROM outbound_webhooks WHERE workspace_id=?", ws)) {
    enqueue("webhook_out", { hookId: h.id, event, data, at: now() }, { workspaceId: ws });
  }
}

export async function deliverWebhook(p: { hookId: string; event: string; data: object; at: number }) {
  const h = get<any>("SELECT * FROM outbound_webhooks WHERE id=?", p.hookId);
  if (!h) return;
  const body = JSON.stringify({ event: p.event, data: p.data, timestamp: p.at });
  const sig = crypto.createHmac("sha256", h.secret).update(body).digest("hex");
  const res = await fetch(h.url, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Signature": `sha256=${sig}` }, body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Webhook ${h.url} responded ${res.status}`);
}

// ---- campaigns ----

export function dispatchCampaign(campaignId: string) {
  const c = get<any>("SELECT * FROM campaigns WHERE id=?", campaignId);
  if (!c || c.status === "completed") return;
  const tpl = get<any>("SELECT * FROM templates WHERE id=?", c.template_id);
  if (!tpl) throw Object.assign(new Error("Template missing"), { permanent: true });
  const contacts = all<Contact>("SELECT * FROM contacts WHERE workspace_id=? AND opted_in=1", c.workspace_id)
    .filter((x) => !c.segment_tag || (JSON.parse(x.tags) as string[]).includes(c.segment_tag));
  let i = 0;
  const start = now();
  for (const contact of contacts) {
    const attrs = JSON.parse(contact.attrs);
    // template variables: {{1}} -> contact name, {{2..}} -> attrs.var2.. (simple default mapping)
    const params = [...(tpl.body as string).matchAll(/\{\{(\d+)\}\}/g)].map((m) =>
      m[1] === "1" ? contact.name ?? "there" : String(attrs[`var${m[1]}`] ?? ""),
    );
    try {
      queueTemplate(c.workspace_id, contact.id, tpl.name, params, { campaignId, runAt: start + i * 120 });
      i++;
    } catch { /* skip contacts that can't be messaged */ }
  }
  run("UPDATE campaigns SET status='completed', total=? WHERE id=?", i, campaignId);
}
