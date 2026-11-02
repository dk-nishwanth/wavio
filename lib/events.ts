import { get, id, now, run } from "./db";
import { upsertContact, ensureConversation } from "./core";
import { startAutomations } from "./automation";

export function ingestEvent(
  ws: string,
  e: { name: string; phone?: string; payload?: Record<string, any>; idempotencyKey?: string; contact?: { name?: string; email?: string; optIn?: boolean; attrs?: object } },
) {
  if (e.idempotencyKey && get("SELECT 1 FROM events WHERE workspace_id=? AND idempotency_key=?", ws, e.idempotencyKey)) {
    return { duplicate: true };
  }
  const contact = e.phone
    ? upsertContact(ws, { phone: e.phone, name: e.contact?.name, email: e.contact?.email, attrs: e.contact?.attrs, optedIn: e.contact?.optIn })
    : null;
  if (contact) ensureConversation(ws, contact.id);
  const eid = id("e_");
  run(
    "INSERT INTO events (id, workspace_id, contact_id, name, payload, idempotency_key, created_at) VALUES (?,?,?,?,?,?,?)",
    eid, ws, contact?.id ?? null, e.name, JSON.stringify(e.payload ?? {}), e.idempotencyKey ?? null, now(),
  );
  if (contact) startAutomations(ws, contact.id, "event", { name: e.name, event: e.payload ?? {} });
  return { id: eid, contactId: contact?.id ?? null };
}
