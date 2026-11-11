import crypto from "node:crypto";
import { get, now, run } from "./db";
import { decrypt } from "./crypto";
import { HttpError } from "./auth";
import { devToolsEnabled } from "./env";
import { ingestEvent } from "./events";
import { logActivity } from "./crm";

export type PayCfg = {
  razorpay_key_id?: string; razorpay_key_secret?: string; razorpay_webhook_secret?: string;
  payu_key?: string; payu_salt?: string; payu_mode?: "test" | "live";
};

export const payCfg = (ws: string): PayCfg => JSON.parse(decrypt(get<any>("SELECT pay_json FROM workspaces WHERE id=?", ws)?.pay_json) ?? "{}");
const base = () => process.env.APP_URL || "http://localhost:3000";

export type Provider = "razorpay" | "payu" | "test";
export function activeProvider(ws: string): Provider {
  const c = payCfg(ws);
  if (c.razorpay_key_id && c.razorpay_key_secret) return "razorpay";
  if (c.payu_key && c.payu_salt) return "payu";
  return "test"; // no gateway keys saved: built-in test checkout so the whole flow can be tried
}

/** Creates (or reuses) a payment link for an order and stores it on the order. */
export async function createPaymentLink(orderId: string): Promise<string> {
  const o = get<any>("SELECT * FROM orders WHERE id=?", orderId);
  if (!o) throw new Error("Order not found");
  if (o.payment_link && o.status === "pending") return o.payment_link;
  const provider = activeProvider(o.workspace_id);
  if (provider === "test" && !devToolsEnabled()) throw new HttpError(409, "Connect Razorpay or PayU in Settings to take payments");
  const c = payCfg(o.workspace_id);
  let url = `${base()}/pay/${o.id}`; // PayU + test use our hosted page
  let ref: string | null = null;
  if (provider === "razorpay") {
    const contact = get<any>("SELECT name, phone FROM contacts WHERE id=?", o.contact_id)!;
    const res = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${c.razorpay_key_id}:${c.razorpay_key_secret}`).toString("base64") },
      body: JSON.stringify({
        amount: Math.round(o.total * 100), currency: o.currency, reference_id: o.id, description: `Order #${o.number}`,
        customer: { name: contact.name ?? undefined, contact: "+" + contact.phone }, notify: { sms: false, email: false },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const d: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(502, d?.error?.description || `Razorpay error ${res.status}`);
    url = d.short_url; ref = d.id;
  }
  run("UPDATE orders SET provider=?, payment_link=?, payment_ref=COALESCE(?,payment_ref) WHERE id=?", provider, url, ref, orderId);
  return url;
}

/** Idempotent: marks an order paid and tells automations/CRM (event "payment_completed"). */
export function markPaid(orderId: string, ref?: string) {
  const o = get<any>("SELECT * FROM orders WHERE id=?", orderId);
  if (!o || o.status === "paid") return;
  run("UPDATE orders SET status='paid', paid_at=?, payment_ref=COALESCE(?,payment_ref) WHERE id=?", now(), ref ?? null, orderId);
  const contact = get<any>("SELECT phone FROM contacts WHERE id=?", o.contact_id);
  logActivity(o.workspace_id, o.contact_id, "order", `Order #${o.number} paid (${o.currency} ${o.total})`);
  if (contact) ingestEvent(o.workspace_id, { name: "payment_completed", phone: contact.phone, payload: { order_id: String(o.number), order_ref: o.id, total: o.total, currency: o.currency }, idempotencyKey: `paid-${o.id}` });
}

export const verifyRazorpaySignature = (body: string, sig: string, secret: string) => {
  const exp = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return sig.length === exp.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp));
};

const sha512 = (s: string) => crypto.createHash("sha512").update(s).digest("hex");

/** Fields the browser POSTs to PayU's hosted checkout. */
export function payuRequest(ws: string, o: any, buyer: { name: string; email: string; phone: string }) {
  const c = payCfg(ws)!;
  const amount = o.total.toFixed(2), info = `Order ${o.number}`;
  const hash = sha512([c.payu_key, o.id, amount, info, buyer.name, buyer.email, "", "", "", "", "", "", "", "", "", "", c.payu_salt].join("|"));
  return {
    action: c.payu_mode === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment",
    fields: { key: c.payu_key!, txnid: o.id, amount, productinfo: info, firstname: buyer.name, email: buyer.email, phone: buyer.phone, surl: `${base()}/api/payments/payu/${ws}`, furl: `${base()}/api/payments/payu/${ws}`, hash },
  };
}

export function verifyPayuResponse(ws: string, f: Record<string, string>) {
  const c = payCfg(ws);
  if (!c.payu_salt) return false;
  const rev = sha512([c.payu_salt, f.status, "", "", "", "", "", "", "", "", "", "", f.email ?? "", f.firstname ?? "", f.productinfo ?? "", f.amount ?? "", f.txnid ?? "", f.key ?? ""].join("|"));
  return rev === f.hash;
}
