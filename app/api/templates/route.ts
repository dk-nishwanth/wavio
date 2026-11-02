import { all, id, now, run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { submitTemplate, waConfig } from "@/lib/wa";

export const GET = handle(async () => {
  const s = await requireSession();
  return json(all("SELECT * FROM templates WHERE workspace_id=? ORDER BY created_at DESC", s.workspaceId));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  const name = String(b.name ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!name || !b.body) return json({ error: "name and body are required" }, 400);
  const tid = id("t_");
  run("INSERT INTO templates (id, workspace_id, name, language, category, body, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
    tid, s.workspaceId, name, b.language || "en", b.category || "MARKETING", b.body, "DRAFT", now());
  try {
    const r = await submitTemplate(waConfig(s.workspaceId), { name, language: b.language || "en", category: b.category || "MARKETING", body: b.body });
    run("UPDATE templates SET status=?, meta_id=? WHERE id=?", r.status, r.id, tid);
  } catch (e: any) {
    run("UPDATE templates SET status='REJECTED' WHERE id=?", tid);
    return json({ id: tid, warning: e.message }, 200);
  }
  return json({ id: tid });
});
