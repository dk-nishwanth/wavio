import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { deleteSource } from "@/lib/kb";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  deleteSource(s.workspaceId, (await params).id);
  return json({ ok: true });
});
