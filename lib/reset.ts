import { all, run } from "./db";

/**
 * Clears everything created by testing — guests, chats, requests, stays, orders, learning — while keeping the setup:
 * rooms, FAQs, knowledge, library files, templates, automations, settings and user accounts.
 */
export function resetTestData(ws: string) {
  const counts: Record<string, number> = {};
  const del = (table: string, where = "workspace_id=?") => { counts[table] = Number(run(`DELETE FROM ${table} WHERE ${where}`, ws).changes); };
  const contactIds = all<any>("SELECT id FROM contacts WHERE workspace_id=?", ws).map((c) => c.id);
  for (const t of ["messages", "conversations", "leads", "activities", "events", "requests", "orders", "flow_runs", "bot_misses", "ai_usage"]) del(t);
  for (const id of contactIds) run("DELETE FROM bot_state WHERE contact_id=?", id);
  run("UPDATE bot_faqs SET hits=0 WHERE workspace_id=?", ws);
  run("DELETE FROM jobs WHERE workspace_id=? AND status IN ('pending','failed')", ws);
  del("contacts");
  return counts;
}
