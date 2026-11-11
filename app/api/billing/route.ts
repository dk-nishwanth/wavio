import { get, run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { EXTRA_SEAT, GST_RATE, listInvoices, PLANS, PERIODS, workspacePlan } from "@/lib/billing";

export const GET = handle(async () => {
  const s = await requireSession();
  const p = workspacePlan(s.workspaceId);
  const w = get<any>("SELECT billing_json FROM workspaces WHERE id=?", s.workspaceId)!;
  return json({
    current: p, seatsUsed: get<any>("SELECT COUNT(*) n FROM users WHERE workspace_id=?", s.workspaceId)!.n,
    plans: Object.entries(PLANS).map(([key, v]) => ({ key, ...v, flows: v.flows === Infinity ? "unlimited" : v.flows })),
    periods: PERIODS, extraSeat: EXTRA_SEAT, gstRate: GST_RATE, invoices: listInvoices(s.workspaceId), billing: JSON.parse(w.billing_json ?? "{}"),
  });
});

export const PUT = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  run("UPDATE workspaces SET billing_json=? WHERE id=?", JSON.stringify({ company: b.company ?? "", gstin: b.gstin ?? "", state: b.state ?? "", address: b.address ?? "" }), s.workspaceId);
  return json({ ok: true });
});
