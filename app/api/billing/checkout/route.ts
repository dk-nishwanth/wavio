import { get, run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { createInvoice, PERIODS, PLANS, type Period, type PlanKey } from "@/lib/billing";

/** Creates an invoice and a way to pay it: Razorpay link if platform keys are set, else the built-in test page. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  if (!(b.plan in PLANS) || !(b.period in PERIODS)) return json({ error: "Unknown plan or period" }, 400);
  const w = get<any>("SELECT billing_json FROM workspaces WHERE id=?", s.workspaceId)!;
  const iid = createInvoice(s.workspaceId, b.plan as PlanKey, b.period as Period, Math.max(0, Math.floor(Number(b.extraSeats) || 0)), JSON.parse(w.billing_json ?? "{}"));
  const inv = get<any>("SELECT * FROM invoices WHERE id=?", iid)!;
  const base = process.env.APP_URL || "http://localhost:3000";
  let link = `${base}/billing/pay/${iid}`;
  const kid = process.env.PLATFORM_RAZORPAY_KEY_ID, ksec = process.env.PLATFORM_RAZORPAY_KEY_SECRET;
  if (kid && ksec) {
    const res = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${kid}:${ksec}`).toString("base64") },
      body: JSON.stringify({ amount: Math.round(inv.total * 100), currency: "INR", reference_id: iid, description: `${PLANS[b.plan as PlanKey].name} plan (${b.period}) — ${inv.number}`, notify: { sms: false, email: false } }),
    });
    const d: any = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: d?.error?.description || "Razorpay error" }, 502);
    link = d.short_url;
  }
  run("UPDATE invoices SET payment_link=? WHERE id=?", link, iid);
  return json({ invoiceId: iid, link });
});
