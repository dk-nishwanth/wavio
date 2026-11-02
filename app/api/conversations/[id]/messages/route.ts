import { get } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { queueTemplate, queueText } from "@/lib/core";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const conv = get<any>("SELECT * FROM conversations WHERE id=? AND workspace_id=?", id, s.workspaceId);
  if (!conv) throw new HttpError(404, "Not found");
  const b = await req.json();
  if (b.template) return json({ id: queueTemplate(s.workspaceId, conv.contact_id, b.template, b.params ?? [], { manual: true }) });
  if (!String(b.text ?? "").trim()) throw new HttpError(400, "Message is empty");
  return json({ id: queueText(s.workspaceId, conv.contact_id, b.text.trim(), { note: !!b.note, manual: !b.note }) });
});
