import { all, get } from "./db";
import { ingestEvent } from "./events";
import { logActivity } from "./crm";
import { diffDays, isoToday, pretty } from "./dates";
import { getBusiness } from "./industry";
import { HttpError } from "./auth";

/** A "stay" is a booking the business recorded: it lives as a booking_confirmed event, undone by a booking_cancelled event with the same booking_id. */
export function listStays(ws: string, contactId?: string) {
  const rows = all<any>(
    `SELECT e.payload, e.created_at, e.contact_id, c.name, c.phone FROM events e JOIN contacts c ON c.id=e.contact_id
     WHERE e.workspace_id=? AND e.name='booking_confirmed' ${contactId ? "AND e.contact_id=?" : ""} ORDER BY e.created_at DESC LIMIT 500`,
    ...(contactId ? [ws, contactId] : [ws]),
  );
  const cancelled = new Set(all<any>("SELECT payload FROM events WHERE workspace_id=? AND name='booking_cancelled'", ws).map((e) => JSON.parse(e.payload).booking_id));
  const today = isoToday();
  return rows.map((r) => {
    const p = JSON.parse(r.payload);
    const status = cancelled.has(p.booking_id) ? "cancelled" : p.check_out_date < today ? "past" : p.check_in_date <= today ? "in_house" : "upcoming";
    return { ...p, status, contact_id: r.contact_id, name: r.name, phone: r.phone, days_to_arrival: diffDays(today, p.check_in_date) };
  });
}

export function recordStay(ws: string, contactId: string, s: { check_in_date: string; check_out_date: string; guests?: number; room?: string; booking_id?: string }) {
  const c = get<any>("SELECT phone FROM contacts WHERE id=? AND workspace_id=?", contactId, ws);
  if (!c) throw new HttpError(404, "Contact not found");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.check_in_date) || !/^\d{4}-\d{2}-\d{2}$/.test(s.check_out_date)) throw new HttpError(400, "Dates must be YYYY-MM-DD");
  if (s.check_out_date <= s.check_in_date) throw new HttpError(400, "Check-out must be after check-in");
  const b = getBusiness(ws);
  const booking_id = s.booking_id || "BK" + Math.floor(1000 + Math.random() * 9000);
  const payload = {
    booking_id, check_in_date: s.check_in_date, check_out_date: s.check_out_date, check_in: pretty(s.check_in_date), check_out: pretty(s.check_out_date),
    nights: diffDays(s.check_in_date, s.check_out_date), guests: s.guests ?? 2, room: s.room ?? "", resort_name: b.name || "our resort", resort_location: b.location ?? "", check_in_time: b.check_in_time || "12:00 PM", check_out_time: b.check_out_time || "11:00 AM",
  };
  ingestEvent(ws, { name: "booking_confirmed", phone: c.phone, payload, idempotencyKey: `stay-${ws}-${booking_id}`, contact: { attrs: { next_check_in: s.check_in_date, next_check_out: s.check_out_date, guests: String(payload.guests) } } });
  logActivity(ws, contactId, "booking", `Stay ${booking_id} recorded: ${payload.check_in} → ${payload.check_out}, ${payload.guests} guests`);
  return payload;
}

export function cancelStay(ws: string, contactId: string, bookingId: string) {
  const c = get<any>("SELECT phone FROM contacts WHERE id=? AND workspace_id=?", contactId, ws);
  if (!c) throw new HttpError(404, "Contact not found");
  ingestEvent(ws, { name: "booking_cancelled", phone: c.phone, payload: { booking_id: bookingId }, idempotencyKey: `cancel-${ws}-${bookingId}` });
  logActivity(ws, contactId, "booking", `Stay ${bookingId} cancelled`);
}
