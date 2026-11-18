import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { buildDigest, sendAlert } from "@/lib/alerts";

/** Sends a test alert (or today's summary) to every configured channel and reports what happened. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json().catch(() => ({}));
  const results = await sendAlert(s.workspaceId, b.digest ? buildDigest(s.workspaceId) : { title: "✅ Wavio test alert", body: "If you can read this, alerts are working. You'll get messages like this when a guest needs a person or a request is waiting." });
  return json({ results, configured: results.length > 0 });
});
