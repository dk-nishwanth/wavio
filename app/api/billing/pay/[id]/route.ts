import { get } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { devToolsEnabled } from "@/lib/env";
import { markInvoicePaid } from "@/lib/billing";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_: Request, { params }: Ctx) => {
  const { id } = await params;
  const i = get<any>("SELECT number, plan, period, total, status FROM invoices WHERE id=?", id);
  return i ? json({ ...i, test: !process.env.PLATFORM_RAZORPAY_KEY_ID }) : json({ error: "Not found" }, 404);
});

/** Test checkout only: disabled once platform Razorpay keys exist. */
export const POST = handle(async (_: Request, { params }: Ctx) => {
  const { id } = await params;
  if (process.env.PLATFORM_RAZORPAY_KEY_ID || !devToolsEnabled()) return json({ error: "Test payments are disabled" }, 403);
  if (!get("SELECT 1 FROM invoices WHERE id=?", id)) return json({ error: "Not found" }, 404);
  markInvoicePaid(id, "test_" + Date.now());
  return json({ ok: true });
});
