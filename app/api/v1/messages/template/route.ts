import { authApiKey, CORS_HEADERS } from "@/lib/apikeys";
import { queueTemplate, upsertContact } from "@/lib/core";
import { handle, json } from "@/lib/http";

export const OPTIONS = (req: Request) => new Response(null, { status: 204, headers: CORS_HEADERS(req.headers.get("origin")) });

/** Server-side only (secret key): send an approved template directly. */
export const POST = handle(async (req: Request) => {
  const { workspaceId } = authApiKey(req, ["secret"]);
  const b = await req.json();
  if (!b.phone || !b.template) return json({ error: "phone and template are required" }, 400);
  const contact = upsertContact(workspaceId, { phone: b.phone, name: b.name, optedIn: b.optIn });
  const messageId = queueTemplate(workspaceId, contact.id, b.template, b.params ?? []);
  return json({ messageId, status: "queued" });
});
