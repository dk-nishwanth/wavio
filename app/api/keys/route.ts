import { all, run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { createKey } from "@/lib/apikeys";

export const GET = handle(async () => {
  const s = await requireSession();
  return json(all<any>("SELECT id, kind, label, key_prefix, allowed_origins, created_at FROM api_keys WHERE workspace_id=?", s.workspaceId)
    .map((k) => ({ ...k, allowed_origins: JSON.parse(k.allowed_origins) })));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  const key = createKey(s.workspaceId, b.kind === "secret" ? "secret" : "public", b.label || "API key", b.origins ?? []);
  return json({ key }); // the only time the full key is returned
});

export const PATCH = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  run("UPDATE api_keys SET allowed_origins=? WHERE id=? AND workspace_id=? AND kind='public'", JSON.stringify(b.origins ?? []), b.id, s.workspaceId);
  return json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  const s = await requireSession();
  const { id } = await req.json();
  run("DELETE FROM api_keys WHERE id=? AND workspace_id=?", id, s.workspaceId);
  return json({ ok: true });
});
