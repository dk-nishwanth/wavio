import { authApiKey, CORS_HEADERS } from "@/lib/apikeys";
import { upsertContact } from "@/lib/core";
import { handle, json } from "@/lib/http";
import { createOrder } from "@/lib/orders";
import { createPaymentLink } from "@/lib/payments";

export const OPTIONS = (req: Request) => new Response(null, { status: 204, headers: CORS_HEADERS(req.headers.get("origin")) });

/** Server-side (secret key): create an order from your website's checkout and get a payment link back. */
export const POST = handle(async (req: Request) => {
  const { workspaceId } = authApiKey(req, ["secret"]);
  const b = await req.json();
  if (!b.phone || !Array.isArray(b.items)) return json({ error: "phone and items[] are required" }, 400);
  const contact = upsertContact(workspaceId, { phone: b.phone, name: b.name, email: b.email, optedIn: b.optIn });
  const o = createOrder(workspaceId, contact.id, b.items);
  const paymentLink = b.createPaymentLink === false ? null : await createPaymentLink(o.id);
  return json({ orderId: o.id, number: o.number, total: o.total, paymentLink });
});
