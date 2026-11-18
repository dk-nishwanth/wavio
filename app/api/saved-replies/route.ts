import { all, id, now, run } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const s = await requireSession();
  return json(all("SELECT * FROM saved_replies WHERE workspace_id=? ORDER BY title", s.workspaceId));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  if (!String(b.title ?? "").trim() || !String(b.text ?? "").trim()) throw new HttpError(400, "A title and the reply text are required");
  const rid = id("sr_");
  run("INSERT INTO saved_replies (id, workspace_id, title, text, created_at) VALUES (?,?,?,?,?)", rid, s.workspaceId, String(b.title).slice(0, 60), String(b.text).slice(0, 2000), now());
  return json({ id: rid });
});
