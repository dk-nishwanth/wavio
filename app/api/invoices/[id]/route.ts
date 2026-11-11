import { get } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { seller } from "@/lib/billing";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const i = get<any>("SELECT * FROM invoices WHERE id=? AND workspace_id=?", id, s.workspaceId);
  if (!i) return json({ error: "Not found" }, 404);
  const buyer = JSON.parse(i.buyer);
  const sel = seller();
  const intra = !!buyer.state && buyer.state.toLowerCase() === sel.state; // same state: CGST + SGST, otherwise IGST
  return json({ ...i, buyer, seller: sel, intra });
});
