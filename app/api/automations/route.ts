import { all, id, now, run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const s = await requireSession();
  return json(all<any>("SELECT * FROM automations WHERE workspace_id=? ORDER BY created_at DESC", s.workspaceId).map((a) => ({ ...a, steps: JSON.parse(a.steps) })));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  if (!["event", "keyword", "first_message"].includes(b.trigger_type)) return json({ error: "Bad trigger" }, 400);
  const aid = id("a_");
  run("INSERT INTO automations (id, workspace_id, name, trigger_type, trigger_value, steps, active, created_at) VALUES (?,?,?,?,?,?,?,?)",
    aid, s.workspaceId, b.name || "Untitled", b.trigger_type, b.trigger_value || "", JSON.stringify(b.steps ?? []), 1, now());
  return json({ id: aid });
});
