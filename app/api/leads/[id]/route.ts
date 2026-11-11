import { all, get, run, now } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { logActivity, STAGE_KEYS } from "@/lib/crm";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const lead = get<any>("SELECT * FROM leads WHERE id=? AND workspace_id=?", id, s.workspaceId);
  if (!lead) throw new HttpError(404, "Not found");
  const activity = all("SELECT * FROM activities WHERE contact_id=? ORDER BY created_at DESC LIMIT 50", lead.contact_id);
  const agents = all("SELECT id, name FROM users WHERE workspace_id=?", s.workspaceId);
  return json({ activity, agents });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const lead = get<any>("SELECT * FROM leads WHERE id=? AND workspace_id=?", id, s.workspaceId);
  if (!lead) throw new HttpError(404, "Not found");
  const b = await req.json();
  if (b.stage && b.stage !== lead.stage) {
    if (!STAGE_KEYS.includes(b.stage)) throw new HttpError(400, "Unknown stage");
    run("UPDATE leads SET stage=? WHERE id=?", b.stage, id);
    logActivity(s.workspaceId, lead.contact_id, "stage", `${s.name} moved lead: ${lead.stage} → ${b.stage}`);
  }
  if ("value" in b) run("UPDATE leads SET value=? WHERE id=?", Math.max(0, Number(b.value) || 0), id);
  if ("owner_id" in b) run("UPDATE leads SET owner_id=? WHERE id=?", b.owner_id || null, id);
  if ("notes" in b) run("UPDATE leads SET notes=? WHERE id=?", String(b.notes ?? ""), id);
  if ("follow_up_at" in b) run("UPDATE leads SET follow_up_at=? WHERE id=?", b.follow_up_at ? new Date(b.follow_up_at).getTime() : null, id);
  if (b.activity) logActivity(s.workspaceId, lead.contact_id, "note", `${s.name}: ${String(b.activity).slice(0, 500)}`);
  run("UPDATE leads SET updated_at=? WHERE id=?", now(), id);
  return json({ ok: true });
});
