import { get } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { activeProvider, markPaid } from "@/lib/payments";

type Ctx = { params: Promise<{ id: string }> };

/** Test checkout only: refused as soon as a real gateway is configured. */
export const POST = handle(async (_: Request, { params }: Ctx) => {
  const { id } = await params;
  const o = get<any>("SELECT * FROM orders WHERE id=?", id);
  if (!o) return json({ error: "Order not found" }, 404);
  if (activeProvider(o.workspace_id) !== "test") return json({ error: "Test payments are disabled" }, 403);
  markPaid(id, "test_" + Date.now());
  return json({ ok: true });
});
