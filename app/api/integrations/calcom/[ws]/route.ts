import crypto from "node:crypto";
import { get } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { metaCfg } from "@/lib/metaleads";
import { ingestEvent } from "@/lib/events";

type Ctx = { params: Promise<{ ws: string }> };

/** Cal.com webhooks (BOOKING_CREATED / RESCHEDULED / CANCELLED) become website events: booking_created etc. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { ws } = await params;
  const secret = metaCfg(ws).calcom_secret;
  const raw = await req.text();
  if (!secret) return json({ error: "Cal.com is not set up" }, 400);
  const exp = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const got = req.headers.get("x-cal-signature-256") ?? "";
  if (got.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(exp))) return json({ error: "Bad signature" }, 401);
  const ev = JSON.parse(raw);
  const p = ev.payload ?? {};
  const a = p.attendees?.[0] ?? {};
  const phone = p.responses?.phone?.value ?? p.responses?.attendeePhoneNumber?.value ?? a.phoneNumber ?? p.metadata?.phone;
  const email = a.email ?? p.responses?.email?.value;
  // no phone on the booking: fall back to a contact we already know by email
  const known = !phone && email ? get<any>("SELECT phone FROM contacts WHERE workspace_id=? AND email=?", ws, email) : null;
  const target = phone ?? known?.phone;
  if (!target) return json({ ok: true, skipped: "no phone number on booking" });
  const name = String(ev.triggerEvent ?? "BOOKING_CREATED").toLowerCase();
  ingestEvent(ws, {
    name, phone: target, contact: { name: a.name, email }, idempotencyKey: p.uid ? `${name}-${p.uid}` : undefined,
    payload: { title: p.title ?? "", start_time: p.startTime ?? "", end_time: p.endTime ?? "", meeting_url: p.metadata?.videoCallUrl ?? p.location ?? "" },
  });
  return json({ ok: true });
});
