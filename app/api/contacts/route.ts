import { all } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { upsertContact } from "@/lib/core";

export const GET = handle(async () => {
  const s = await requireSession();
  const rows = all<any>("SELECT * FROM contacts WHERE workspace_id=? ORDER BY created_at DESC LIMIT 1000", s.workspaceId);
  return json(rows.map((r) => ({ ...r, tags: JSON.parse(r.tags), attrs: JSON.parse(r.attrs) })));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  const c = upsertContact(s.workspaceId, { phone: b.phone, name: b.name, email: b.email, tags: b.tags, optedIn: !!b.optedIn });
  return json({ id: c.id });
});
