import { get, run } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { createPaymentLink } from "@/lib/payments";
import { queueText } from "@/lib/core";
import { money } from "@/lib/orders";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const o = get<any>("SELECT * FROM orders WHERE id=? AND workspace_id=?", id, s.workspaceId);
  if (!o) throw new HttpError(404, "Not found");
  const b = await req.json();
  if (["pending", "paid", "fulfilled", "cancelled"].includes(b.status)) run("UPDATE orders SET status=? WHERE id=?", b.status, id);
  return json({ ok: true });
});

/** Create a payment link and send it in the chat (needs the 24h window). */
export const POST = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const o = get<any>("SELECT * FROM orders WHERE id=? AND workspace_id=?", id, s.workspaceId);
  if (!o) throw new HttpError(404, "Not found");
  const link = await createPaymentLink(id);
  const lines = (JSON.parse(o.items) as any[]).map((i) => `• ${i.name} × ${i.qty} — ${money(i.price * i.qty)}`).join("\n");
  queueText(s.workspaceId, o.contact_id, `Your order #${o.number}\n${lines}\nTotal: ${money(o.total)}\n\nPay securely here: ${link}`);
  return json({ link });
});
