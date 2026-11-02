import { authApiKey, CORS_HEADERS } from "@/lib/apikeys";
import { upsertContact } from "@/lib/core";
import { handle, json } from "@/lib/http";

export const OPTIONS = (req: Request) => new Response(null, { status: 204, headers: CORS_HEADERS(req.headers.get("origin")) });

/** identify(): create or update a contact. Opt-in must be explicit. */
export const POST = handle(async (req: Request) => {
  const cors = CORS_HEADERS(req.headers.get("origin"));
  const { workspaceId } = authApiKey(req, ["public", "secret"]);
  const b = await req.json();
  if (!b.phone) return json({ error: "phone is required" }, 400, cors);
  const c = upsertContact(workspaceId, { phone: b.phone, name: b.name, email: b.email, attrs: b.attributes, tags: b.tags, optedIn: b.optIn });
  return json({ id: c.id, phone: c.phone, optedIn: !!c.opted_in }, 200, cors);
});
