import { all } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { createOrder } from "@/lib/orders";
import { createPaymentLink } from "@/lib/payments";

export const GET = handle(async () => {
  const s = await requireSession();
  return json(all<any>("SELECT o.*, c.name, c.phone FROM orders o JOIN contacts c ON c.id=o.contact_id WHERE o.workspace_id=? ORDER BY o.created_at DESC LIMIT 300", s.workspaceId)
    .map((o) => ({ ...o, items: JSON.parse(o.items) })));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  const o = createOrder(s.workspaceId, b.contactId, b.items);
  const link = b.paymentLink ? await createPaymentLink(o.id) : null;
  return json({ ...o, link });
});
