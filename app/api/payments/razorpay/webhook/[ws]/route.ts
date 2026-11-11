import { handle, json } from "@/lib/http";
import { markPaid, payCfg, verifyRazorpaySignature } from "@/lib/payments";

type Ctx = { params: Promise<{ ws: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { ws } = await params;
  const secret = payCfg(ws).razorpay_webhook_secret;
  const raw = await req.text();
  if (!secret || !verifyRazorpaySignature(raw, req.headers.get("x-razorpay-signature") ?? "", secret)) return json({ error: "Bad signature" }, 401);
  const ev = JSON.parse(raw);
  if (ev.event === "payment_link.paid") {
    const link = ev.payload?.payment_link?.entity;
    if (link?.reference_id) markPaid(link.reference_id, ev.payload?.payment?.entity?.id);
  }
  return json({ ok: true });
});
