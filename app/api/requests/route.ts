import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { listRequests, pendingRequests } from "@/lib/requests";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  return json({ requests: listRequests(s.workspaceId, new URL(req.url).searchParams.get("status") ?? undefined), open: pendingRequests(s.workspaceId) });
});
