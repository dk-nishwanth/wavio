import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { ingestLeadFields } from "@/lib/metaleads";

/** Simulates a Meta lead-form submission without needing a real ad. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  const c = ingestLeadFields(s.workspaceId, [
    { name: "full_name", values: [b.name || "Test Lead"] }, { name: "phone_number", values: [b.phone] }, { name: "email", values: [b.email || ""] }, { name: "interested_in", values: [b.interest || "Kids wear"] },
  ], { formId: "dev-form" });
  return json({ contactId: c.id });
});
