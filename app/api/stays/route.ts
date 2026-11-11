import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { listStays, recordStay } from "@/lib/stays";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  return json(listStays(s.workspaceId, new URL(req.url).searchParams.get("contactId") ?? undefined));
});

/** Record a booking so reminders, review requests and the pipeline pick it up. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  return json(recordStay(s.workspaceId, b.contactId, { check_in_date: b.check_in_date, check_out_date: b.check_out_date, guests: Number(b.guests) || 2, room: b.room }));
});
