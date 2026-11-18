import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { listMisses, suggestKeywords } from "@/lib/learning";

/** Guest messages the bot couldn't answer, most-asked first, with suggested trigger words. */
export const GET = handle(async () => {
  const s = await requireSession();
  return json(listMisses(s.workspaceId).map((m) => ({ ...m, suggested: suggestKeywords(m.text) })));
});
