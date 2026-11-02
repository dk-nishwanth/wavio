import { authApiKey, CORS_HEADERS } from "@/lib/apikeys";
import { ingestEvent } from "@/lib/events";
import { handle, json } from "@/lib/http";

export const OPTIONS = (req: Request) => new Response(null, { status: 204, headers: CORS_HEADERS(req.headers.get("origin")) });

/** track(): record an event for a contact and fire any automation listening for it. */
export const POST = handle(async (req: Request) => {
  const cors = CORS_HEADERS(req.headers.get("origin"));
  const { workspaceId } = authApiKey(req, ["public", "secret"]);
  const b = await req.json();
  if (!b.event) return json({ error: "event is required" }, 400, cors);
  const r = ingestEvent(workspaceId, {
    name: String(b.event), phone: b.phone, payload: b.properties, idempotencyKey: b.idempotencyKey,
    contact: { name: b.name, email: b.email, optIn: b.optIn, attrs: b.attributes },
  });
  return json(r, 200, cors);
});
