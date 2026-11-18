import { all, get, run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

/** Wipes only the Test page's pretend guest (chat, bot memory, requests, bookings, lead). Real guests are untouched. */
export const POST = handle(async () => {
  const s = await requireSession(); const ws = s.workspaceId;
  const c = get<any>("SELECT id FROM contacts WHERE workspace_id=? AND phone='10000000001'", ws);
  if (!c) return json({ ok: true });
  for (const t of ["messages", "conversations", "leads", "activities", "events", "requests", "orders", "bot_state", "flow_runs"]) run(`DELETE FROM ${t} WHERE contact_id=?`, c.id);
  run("DELETE FROM jobs WHERE payload LIKE ?", `%${c.id}%`);
  run("DELETE FROM contacts WHERE id=?", c.id);
  void all;
  return json({ ok: true });
});
