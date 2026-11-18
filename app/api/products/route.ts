import { all, id, now, run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { clearVocabCache } from "@/lib/fuzzy";

export const GET = handle(async () => {
  const s = await requireSession();
  return json(all("SELECT * FROM products WHERE workspace_id=? ORDER BY created_at DESC", s.workspaceId));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  if (!String(b.name ?? "").trim()) return json({ error: "Name is required" }, 400);
  const pid = id("p_");
  run("INSERT INTO products (id, workspace_id, name, description, price, currency, image_url, sku, active, capacity, units, weekend_price, meal_plan, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    pid, s.workspaceId, b.name.trim(), b.description ?? "", Math.max(0, Number(b.price) || 0), "INR", b.image_url ?? "", b.sku ?? "", 1,
    Math.max(1, Math.floor(Number(b.capacity) || 2)), Math.max(1, Math.floor(Number(b.units) || 1)), Number(b.weekend_price) > 0 ? Number(b.weekend_price) : null, String(b.meal_plan ?? "").slice(0, 120), now());
  clearVocabCache();
  return json({ id: pid });
});
