import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { upsertContact } from "@/lib/core";
import { recordStay } from "@/lib/stays";
import { roomLoad } from "@/lib/pricing";
import { audit } from "@/lib/audit";

/** Walk-in or phone booking: finds or creates the guest by phone, checks the room isn't already taken, records the stay. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  if (!b.phone) throw new HttpError(400, "Guest phone number is required");
  const load = b.room ? roomLoad(s.workspaceId, b.room, b.check_in_date, b.check_out_date) : null;
  if (load?.full && !b.force) throw new HttpError(409, `${b.room} is already fully booked for these dates (${load.taken} of ${load.units}). Book anyway to overbook.`);
  const c = upsertContact(s.workspaceId, { phone: b.phone, name: b.name, optedIn: b.optIn ? true : undefined });
  const stay = recordStay(s.workspaceId, c.id, { check_in_date: b.check_in_date, check_out_date: b.check_out_date, guests: Number(b.guests) || 2, room: b.room || undefined });
  audit(s, "stay.manual", `${stay.booking_id} for ${b.phone}`);
  return json(stay);
});
