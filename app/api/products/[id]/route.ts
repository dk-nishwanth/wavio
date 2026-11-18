import { run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { clearVocabCache } from "@/lib/fuzzy";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const b = await req.json();
  run("UPDATE products SET name=COALESCE(?,name), description=COALESCE(?,description), price=COALESCE(?,price), image_url=COALESCE(?,image_url), active=COALESCE(?,active), capacity=COALESCE(?,capacity), units=COALESCE(?,units), meal_plan=COALESCE(?,meal_plan) WHERE id=? AND workspace_id=?",
    b.name ?? null, b.description ?? null, b.price == null ? null : Math.max(0, Number(b.price) || 0), b.image_url ?? null, b.active == null ? null : b.active ? 1 : 0,
    b.capacity == null ? null : Math.max(1, Math.floor(Number(b.capacity) || 1)), b.units == null ? null : Math.max(1, Math.floor(Number(b.units) || 1)), b.meal_plan ?? null, id, s.workspaceId);
  if ("weekend_price" in b) run("UPDATE products SET weekend_price=? WHERE id=? AND workspace_id=?", Number(b.weekend_price) > 0 ? Number(b.weekend_price) : null, id, s.workspaceId);
  clearVocabCache();
  return json({ ok: true });
});

export const DELETE = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  run("DELETE FROM products WHERE id=? AND workspace_id=?", id, s.workspaceId);
  clearVocabCache();
  return json({ ok: true });
});
