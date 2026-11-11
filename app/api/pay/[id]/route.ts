import { get } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { activeProvider } from "@/lib/payments";

type Ctx = { params: Promise<{ id: string }> };

/** Public: the hosted pay page reads the order summary. */
export const GET = handle(async (_: Request, { params }: Ctx) => {
  const { id } = await params;
  const o = get<any>("SELECT o.*, w.name AS shop FROM orders o JOIN workspaces w ON w.id=o.workspace_id WHERE o.id=?", id);
  if (!o) return json({ error: "Order not found" }, 404);
  return json({ number: o.number, total: o.total, currency: o.currency, status: o.status, shop: o.shop, items: JSON.parse(o.items), provider: activeProvider(o.workspace_id) });
});
