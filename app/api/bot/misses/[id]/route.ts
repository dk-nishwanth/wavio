import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { resolveMiss } from "@/lib/learning";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  resolveMiss(s.workspaceId, (await params).id, "dismissed");
  return json({ ok: true });
});
