import { run, get } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  if (!get("SELECT 1 FROM contacts WHERE id=? AND workspace_id=?", id, s.workspaceId)) throw new HttpError(404, "Not found");
  const b = await req.json();
  if (Array.isArray(b.tags)) run("UPDATE contacts SET tags=? WHERE id=?", JSON.stringify(b.tags), id);
  if ("optedIn" in b) run("UPDATE contacts SET opted_in=? WHERE id=?", b.optedIn ? 1 : 0, id);
  if ("name" in b) run("UPDATE contacts SET name=? WHERE id=?", b.name, id);
  return json({ ok: true });
});

export const DELETE = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  run("DELETE FROM messages WHERE contact_id=? AND workspace_id=?", id, s.workspaceId);
  run("DELETE FROM conversations WHERE contact_id=? AND workspace_id=?", id, s.workspaceId);
  run("DELETE FROM contacts WHERE id=? AND workspace_id=?", id, s.workspaceId);
  return json({ ok: true });
});
