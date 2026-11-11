import { get, run } from "@/lib/db";
import { listRuns } from "@/lib/flow";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const b = await req.json();
  if ("active" in b) run("UPDATE automations SET active=? WHERE id=? AND workspace_id=?", b.active ? 1 : 0, id, s.workspaceId);
  if (b.graph) run("UPDATE automations SET graph=?, name=COALESCE(?,name), trigger_type=COALESCE(?,trigger_type), trigger_value=COALESCE(?,trigger_value) WHERE id=? AND workspace_id=?",
    JSON.stringify(b.graph), b.name ?? null, b.trigger_type ?? null, b.trigger_value ?? null, id, s.workspaceId);
  if (b.steps) run("UPDATE automations SET steps=?, name=COALESCE(?,name), trigger_type=COALESCE(?,trigger_type), trigger_value=COALESCE(?,trigger_value) WHERE id=? AND workspace_id=?",
    JSON.stringify(b.steps), b.name ?? null, b.trigger_type ?? null, b.trigger_value ?? null, id, s.workspaceId);
  return json({ ok: true });
});

export const GET = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const a = get<any>("SELECT * FROM automations WHERE id=? AND workspace_id=?", id, s.workspaceId);
  if (!a) return json({ error: "Not found" }, 404);
  return json({ ...a, steps: JSON.parse(a.steps), graph: a.graph ? JSON.parse(a.graph) : null, runs: listRuns(s.workspaceId, id) });
});

export const DELETE = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  run("DELETE FROM automations WHERE id=? AND workspace_id=?", id, s.workspaceId);
  return json({ ok: true });
});
