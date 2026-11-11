import { all, get, id, now, run } from "./db";
import { enqueue } from "./queue";

export const STAGES = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal", label: "Proposal" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
] as const;
export const STAGE_KEYS: string[] = STAGES.map((s) => s.key);

export const temperature = (score: number) => (score >= 60 ? "hot" : score >= 30 ? "warm" : "new");

export function logActivity(ws: string, contactId: string, kind: string, text: string) {
  run("INSERT INTO activities (id, workspace_id, contact_id, kind, text, created_at) VALUES (?,?,?,?,?,?)", id("act_"), ws, contactId, kind, text, now());
}

/** Rule-based lead score, 0-100. Recent replies, buying events and engagement push a lead toward "hot". */
export function computeScore(ws: string, contactId: string): number {
  const c = get<any>("SELECT * FROM contacts WHERE id=?", contactId);
  if (!c) return 0;
  let score = 0;
  const inbound = get<any>("SELECT COUNT(*) n, MAX(created_at) last FROM messages WHERE contact_id=? AND direction='in'", contactId)!;
  score += Math.min(inbound.n, 5) * 6; // conversation depth, capped
  if (inbound.last) {
    const age = (now() - inbound.last) / 864e5;
    score += age < 1 ? 20 : age < 7 ? 10 : age < 30 ? 4 : 0;
  }
  const read = get<any>("SELECT COUNT(*) n FROM messages WHERE contact_id=? AND direction='out' AND status='read'", contactId)!.n;
  score += Math.min(read, 3) * 3;
  const ev = (name: string) => get<any>("SELECT COUNT(*) n FROM events WHERE contact_id=? AND name=?", contactId, name)!.n > 0;
  if (ev("order_placed")) score += 30;
  if (ev("booking_confirmed")) score += 30;
  if (ev("cart_updated")) score += 12;
  if (ev("payment_completed")) score += 20;
  const tags: string[] = JSON.parse(c.tags);
  if (tags.includes("interested")) score += 15;
  if (tags.includes("hot")) score += 25;
  if (c.opted_in) score += 5;
  return Math.max(0, Math.min(100, score));
}

/** Creates the lead if missing, then refreshes its score. Safe to call on every inbound message or event. */
export function touchLead(ws: string, contactId: string, source = "whatsapp") {
  let lead = get<any>("SELECT * FROM leads WHERE contact_id=?", contactId);
  if (!lead) {
    const lid = id("ld_");
    run("INSERT INTO leads (id, workspace_id, contact_id, stage, score, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", lid, ws, contactId, "new", 0, source, now(), now());
    logActivity(ws, contactId, "lead", `Lead created from ${source}`);
    enqueue("zoho_push", { workspaceId: ws, contactId }, { workspaceId: ws });
    lead = get<any>("SELECT * FROM leads WHERE id=?", lid);
  }
  const score = computeScore(ws, contactId);
  // an order is a conversion signal: move open leads forward automatically
  const bought = get<any>("SELECT 1 x FROM events WHERE contact_id=? AND name IN ('order_placed','payment_completed','booking_confirmed')", contactId);
  const stage = bought && !["won", "lost"].includes(lead.stage) ? "won" : lead.stage;
  if (stage !== lead.stage) logActivity(ws, contactId, "stage", "Moved to Won (order placed)");
  run("UPDATE leads SET score=?, stage=?, updated_at=? WHERE id=?", score, stage, now(), lead.id);
}

export function setStage(ws: string, contactId: string, stage: string) {
  if (!STAGE_KEYS.includes(stage)) throw new Error(`Unknown stage "${stage}"`);
  touchLead(ws, contactId, "automation");
  const lead = get<any>("SELECT * FROM leads WHERE contact_id=?", contactId)!;
  if (lead.stage === stage) return;
  run("UPDATE leads SET stage=?, updated_at=? WHERE id=?", stage, now(), lead.id);
  logActivity(ws, contactId, "stage", `Stage changed: ${lead.stage} → ${stage}`);
}

/** One-time catch-up for contacts that chatted before the CRM existed. */
function backfill(ws: string) {
  const missing = all<any>(
    `SELECT DISTINCT m.contact_id FROM messages m WHERE m.workspace_id=? AND m.direction='in'
     AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.contact_id=m.contact_id)`, ws);
  for (const r of missing) touchLead(ws, r.contact_id, "whatsapp");
}

export const listLeads = (ws: string) => (backfill(ws), all<any>(
    `SELECT l.*, c.name, c.phone, c.email, c.tags, cv.id AS conversation_id, cv.last_preview, cv.last_message_at
     FROM leads l JOIN contacts c ON c.id=l.contact_id LEFT JOIN conversations cv ON cv.contact_id=c.id
     WHERE l.workspace_id=? ORDER BY l.score DESC, l.updated_at DESC`, ws,
  )).map((l) => ({ ...l, tags: JSON.parse(l.tags), temperature: temperature(l.score) }));
