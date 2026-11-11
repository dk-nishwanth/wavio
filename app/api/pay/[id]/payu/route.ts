import { get } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { activeProvider, payuRequest } from "@/lib/payments";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_: Request, { params }: Ctx) => {
  const { id } = await params;
  const o = get<any>("SELECT * FROM orders WHERE id=?", id);
  if (!o || o.status !== "pending" || activeProvider(o.workspace_id) !== "payu") return json({ error: "Not payable" }, 400);
  const c = get<any>("SELECT name, email, phone FROM contacts WHERE id=?", o.contact_id)!;
  return json(payuRequest(o.workspace_id, o, { name: c.name || "Customer", email: c.email || "customer@example.com", phone: c.phone }));
});
