import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { handle, json } from "@/lib/http";
import { deleteSource } from "@/lib/kb";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const id = (await params).id;
  deleteSource(s.workspaceId, id);
  audit(s, "kb.remove", id);
  return json({ ok: true });
});
