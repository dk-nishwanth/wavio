import { run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const b = await req.json();
  run("UPDATE bot_faqs SET keywords=COALESCE(?,keywords), answer=COALESCE(?,answer), asset_label=?, enabled=COALESCE(?,enabled) WHERE id=? AND workspace_id=?",
    b.keywords ?? null, b.answer ?? null, b.asset_label || null, b.enabled == null ? null : b.enabled ? 1 : 0, (await params).id, s.workspaceId);
  return json({ ok: true });
});

export const DELETE = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  run("DELETE FROM bot_faqs WHERE id=? AND workspace_id=?", (await params).id, s.workspaceId);
  return json({ ok: true });
});
