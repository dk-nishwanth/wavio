import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { enqueue } from "@/lib/queue";

export const POST = handle(async () => {
  const s = await requireSession();
  enqueue("sync_templates", { workspaceId: s.workspaceId }, { workspaceId: s.workspaceId });
  return json({ ok: true });
});
