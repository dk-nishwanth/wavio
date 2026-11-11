import { get, run } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  if (s.role !== "admin") throw new HttpError(403, "Only admins can remove users");
  if (id === s.userId) throw new HttpError(400, "You can't remove yourself");
  if (!get("SELECT 1 FROM users WHERE id=? AND workspace_id=?", id, s.workspaceId)) throw new HttpError(404, "Not found");
  run("UPDATE conversations SET assigned_to=NULL WHERE assigned_to=?", id);
  run("DELETE FROM users WHERE id=? AND workspace_id=?", id, s.workspaceId);
  return json({ ok: true });
});
