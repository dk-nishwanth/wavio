import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { cancelStay } from "@/lib/stays";

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  cancelStay(s.workspaceId, b.contactId, b.booking_id);
  return json({ ok: true });
});
