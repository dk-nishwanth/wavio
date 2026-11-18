import { run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  run("DELETE FROM saved_replies WHERE id=? AND workspace_id=?", (await params).id, s.workspaceId);
  return json({ ok: true });
});
