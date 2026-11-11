import { run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const b = await req.json();
  run("UPDATE products SET name=COALESCE(?,name), description=COALESCE(?,description), price=COALESCE(?,price), image_url=COALESCE(?,image_url), active=COALESCE(?,active) WHERE id=? AND workspace_id=?",
    b.name ?? null, b.description ?? null, b.price == null ? null : Math.max(0, Number(b.price) || 0), b.image_url ?? null, b.active == null ? null : b.active ? 1 : 0, id, s.workspaceId);
  return json({ ok: true });
});

export const DELETE = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  run("DELETE FROM products WHERE id=? AND workspace_id=?", id, s.workspaceId);
  return json({ ok: true });
});
