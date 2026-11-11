import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { installResortPack } from "@/lib/starter";

export const POST = handle(async () => {
  const s = await requireSession();
  return json({ created: await installResortPack(s.workspaceId) });
});
