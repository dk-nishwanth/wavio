import { all, get, id, now, run } from "./db";
import { HttpError } from "./auth";

export const GST_RATE = 0.18;
export const TRIAL_DAYS = 14;
export const EXTRA_SEAT = 399;

export const PLANS = {
  basic: { name: "Basic", price: 1249, seats: 1, flows: 2, scheduler: false, api: false, blurb: "1 user, 2 chatbot flows, inbox and broadcasts" },
  starter: { name: "Starter", price: 2499, seats: 5, flows: Infinity, scheduler: true, api: false, blurb: "5 users, unlimited flows, scheduled broadcasts, lead forms" },
  pro: { name: "Pro", price: 3749, seats: 5, flows: Infinity, scheduler: true, api: true, blurb: "Everything, plus workflows, integrations and the developer API" },
} as const;
export type PlanKey = keyof typeof PLANS;
export const PERIODS = { monthly: { months: 1, discount: 0 }, annual: { months: 12, discount: 0.2 } } as const;
export type Period = keyof typeof PERIODS;

/** New workspaces start on a Pro trial; after it lapses they fall back to Basic limits. */
export function workspacePlan(ws: string): { plan: PlanKey; until: number | null; trial: boolean; active: boolean; extraSeats: number } {
  const w = get<any>("SELECT plan, plan_until, extra_seats, created_at FROM workspaces WHERE id=?", ws);
  if (!w) throw new HttpError(404, "Workspace not found");
  if (!w.plan) return { plan: "pro", until: w.created_at + TRIAL_DAYS * 864e5, trial: true, active: now() < w.created_at + TRIAL_DAYS * 864e5, extraSeats: 0 };
  return { plan: w.plan, until: w.plan_until, trial: false, active: !w.plan_until || now() < w.plan_until, extraSeats: w.extra_seats ?? 0 };
}

export const effectivePlan = (ws: string) => { const p = workspacePlan(ws); return p.active ? PLANS[p.plan] : PLANS.basic; };

export function assertCan(ws: string, what: "seat" | "flow" | "schedule" | "api") {
  const p = effectivePlan(ws), w = workspacePlan(ws);
  if (what === "seat" && (get<any>("SELECT COUNT(*) n FROM users WHERE workspace_id=?", ws)!.n as number) >= p.seats + w.extraSeats)
    throw new HttpError(402, `Your ${p.name} plan includes ${p.seats + w.extraSeats} user(s). Upgrade or add seats in Billing.`);
  if (what === "flow" && (get<any>("SELECT COUNT(*) n FROM automations WHERE workspace_id=? AND graph IS NOT NULL", ws)!.n as number) >= p.flows)
    throw new HttpError(402, `Your ${p.name} plan includes ${p.flows} flows. Upgrade in Billing.`);
  if (what === "schedule" && !p.scheduler) throw new HttpError(402, "Scheduled broadcasts need the Starter plan or above.");
  if (what === "api" && !p.api) throw new HttpError(402, "The developer API needs the Pro plan.");
}

export function priceFor(plan: PlanKey, period: Period, extraSeats = 0) {
  const per = PERIODS[period];
  const base = Math.round((PLANS[plan].price + extraSeats * EXTRA_SEAT) * per.months * (1 - per.discount));
  return { base, gst: Math.round(base * GST_RATE * 100) / 100 };
}

export const seller = () => ({
  name: process.env.SELLER_NAME || "Your Company Pvt Ltd", gstin: process.env.SELLER_GSTIN || "", state: (process.env.SELLER_STATE || "Telangana").toLowerCase(),
  address: process.env.SELLER_ADDRESS || "Registered address",
});

export function createInvoice(ws: string, plan: PlanKey, period: Period, extraSeats: number, buyer: object) {
  const { base, gst } = priceFor(plan, period, extraSeats);
  const year = new Date().getFullYear();
  const n = (get<any>("SELECT COUNT(*) n FROM invoices")!.n as number) + 1;
  const iid = id("inv_");
  run("INSERT INTO invoices (id, workspace_id, number, plan, period, extra_seats, base, gst, total, buyer, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    iid, ws, `WAV-${year}-${String(n).padStart(4, "0")}`, plan, period, extraSeats, base, gst, base + gst, JSON.stringify(buyer), now());
  return iid;
}

/** Idempotent: activates the plan for the period the invoice covers. */
export function markInvoicePaid(invoiceId: string, ref?: string) {
  const inv = get<any>("SELECT * FROM invoices WHERE id=?", invoiceId);
  if (!inv || inv.status === "paid") return;
  const cur = workspacePlan(inv.workspace_id);
  const from = cur.until && cur.until > now() && !cur.trial && cur.plan === inv.plan ? cur.until : now(); // renewals stack
  const until = from + PERIODS[inv.period as Period].months * 30 * 864e5;
  run("UPDATE invoices SET status='paid', paid_at=?, payment_ref=? WHERE id=?", now(), ref ?? null, invoiceId);
  run("UPDATE workspaces SET plan=?, plan_until=?, extra_seats=? WHERE id=?", inv.plan, until, inv.extra_seats, inv.workspace_id);
}

export const listInvoices = (ws: string) => all("SELECT * FROM invoices WHERE workspace_id=? ORDER BY created_at DESC", ws);
