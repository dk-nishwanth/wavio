import { all } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const u = new URL(req.url);
  const filter = u.searchParams.get("filter"); // mine | unassigned | unread | closed
  const q = u.searchParams.get("q")?.toLowerCase();
  let rows = all<any>(
    `SELECT cv.*, c.name, c.phone, c.tags, c.opted_in FROM conversations cv JOIN contacts c ON c.id = cv.contact_id
     WHERE cv.workspace_id=? AND cv.last_message_at IS NOT NULL ORDER BY cv.last_message_at DESC LIMIT 300`, s.workspaceId);
  if (filter === "mine") rows = rows.filter((r) => r.assigned_to === s.userId);
  else if (filter === "unassigned") rows = rows.filter((r) => !r.assigned_to && r.status === "open");
  else if (filter === "unread") rows = rows.filter((r) => r.unread > 0);
  else if (filter === "closed") rows = rows.filter((r) => r.status === "closed");
  else rows = rows.filter((r) => r.status !== "closed");
  if (q) rows = rows.filter((r) => `${r.name ?? ""} ${r.phone}`.toLowerCase().includes(q));
  return json(rows.map((r) => ({ ...r, tags: JSON.parse(r.tags) })));
});
