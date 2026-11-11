import { NextResponse } from "next/server";
import { markPaid, verifyPayuResponse } from "@/lib/payments";
import { get } from "@/lib/db";

type Ctx = { params: Promise<{ ws: string }> };

/** PayU posts the browser back here (surl/furl). Only a valid reverse hash marks the order paid. */
export async function POST(req: Request, { params }: Ctx) {
  const { ws } = await params;
  const f = Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]));
  const o = get<any>("SELECT * FROM orders WHERE id=? AND workspace_id=?", f.txnid, ws);
  if (o && f.status === "success" && verifyPayuResponse(ws, f) && Number(f.amount) === Number(o.total)) markPaid(o.id, f.mihpayid);
  return NextResponse.redirect(new URL(`/pay/${f.txnid}`, req.url), 303);
}
