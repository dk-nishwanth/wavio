import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { DEFAULT_REPLIES, REPLY_HELP, getReplies, saveReplies } from "@/lib/hotelbot";

export const GET = handle(async () => {
  const s = await requireSession();
  return json({ defaults: DEFAULT_REPLIES, current: getReplies(s.workspaceId), help: REPLY_HELP });
});

/** Body: { replies: { key: "new wording" } }. Anything left at the default (or blank) is reset. */
export const PUT = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  saveReplies(s.workspaceId, b.replies ?? {});
  return json({ ok: true });
});
