import { handle, json } from "@/lib/http";
import { markInvoicePaid } from "@/lib/billing";
import { verifyRazorpaySignature } from "@/lib/payments";

/** Razorpay → us, for plan payments (set PLATFORM_RAZORPAY_WEBHOOK_SECRET). */
export const POST = handle(async (req: Request) => {
  const secret = process.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET;
  const raw = await req.text();
  if (!secret || !verifyRazorpaySignature(raw, req.headers.get("x-razorpay-signature") ?? "", secret)) return json({ error: "Bad signature" }, 401);
  const ev = JSON.parse(raw);
  if (ev.event === "payment_link.paid" && ev.payload?.payment_link?.entity?.reference_id) markInvoicePaid(ev.payload.payment_link.entity.reference_id, ev.payload?.payment?.entity?.id);
  return json({ ok: true });
});
