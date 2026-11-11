import { all, get, run } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { windowOpen } from "@/lib/core";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const conv = get<any>(
    "SELECT cv.*, c.name, c.phone, c.email, c.tags, c.attrs, c.opted_in FROM conversations cv JOIN contacts c ON c.id=cv.contact_id WHERE cv.id=? AND cv.workspace_id=?", id, s.workspaceId);
  if (!conv) throw new HttpError(404, "Not found");
  run("UPDATE conversations SET unread=0 WHERE id=?", id);
  const messages = all("SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC, rowid ASC LIMIT 500", id);
  const agents = all("SELECT id, name FROM users WHERE workspace_id=?", s.workspaceId);
  return json({ conversation: { ...conv, tags: JSON.parse(conv.tags), attrs: JSON.parse(conv.attrs), windowOpen: windowOpen(conv) }, messages, agents });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const b = await req.json();
  const conv = get<any>("SELECT * FROM conversations WHERE id=? AND workspace_id=?", id, s.workspaceId);
  if (!conv) throw new HttpError(404, "Not found");
  if ("assigned_to" in b) run("UPDATE conversations SET assigned_to=? WHERE id=?", b.assigned_to || null, id);
  if ("status" in b) run("UPDATE conversations SET status=? WHERE id=?", b.status === "closed" ? "closed" : "open", id);
  if ("bot_paused" in b) run("UPDATE conversations SET bot_paused=? WHERE id=?", b.bot_paused ? 1 : 0, id);
  if (Array.isArray(b.tags)) run("UPDATE contacts SET tags=? WHERE id=?", JSON.stringify(b.tags), conv.contact_id);
  return json({ ok: true });
});
