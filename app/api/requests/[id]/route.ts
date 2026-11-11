import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { decideRequest } from "@/lib/requests";

type Ctx = { params: Promise<{ id: string }> };

/** Body: { action: "approve" | "decline" | "done", note?, message? (sent to the guest), advance? (₹, bookings only) } */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const b = await req.json();
  if (!["approve", "decline", "done"].includes(b.action)) throw new HttpError(400, "Unknown action");
  return json(await decideRequest(s.workspaceId, (await params).id, s.userId, { action: b.action, note: b.note, message: b.message, advance: b.advance }));
});
