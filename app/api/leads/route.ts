import { get } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { listLeads, STAGES, touchLead } from "@/lib/crm";

export const GET = handle(async () => {
  const s = await requireSession();
  return json({ stages: STAGES, leads: listLeads(s.workspaceId) });
});

/** Promote an existing contact to a lead. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const { contactId } = await req.json();
  if (!get("SELECT 1 FROM contacts WHERE id=? AND workspace_id=?", contactId, s.workspaceId)) return json({ error: "Contact not found" }, 404);
  touchLead(s.workspaceId, contactId, "manual");
  return json({ ok: true });
});
