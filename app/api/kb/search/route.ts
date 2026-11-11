import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { searchKb } from "@/lib/kb";

/** Lets an admin check what the concierge would find for a question. */
export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  return json(searchKb(s.workspaceId, new URL(req.url).searchParams.get("q") ?? ""));
});
