import fs from "node:fs";
import { get, run } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { resolveMedia } from "@/lib/media";

type Ctx = { params: Promise<{ id: string }> };

/** Preview/download for the signed-in admin. */
export const GET = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const a = get<any>("SELECT * FROM assets WHERE id=? AND workspace_id=?", id, s.workspaceId);
  if (!a) throw new HttpError(404, "Not found");
  const file = resolveMedia(a.path);
  if (!fs.existsSync(file)) throw new HttpError(404, "File missing");
  return new Response(new Uint8Array(fs.readFileSync(file)), { headers: { "Content-Type": a.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600", "Content-Security-Policy": "default-src 'none'; sandbox" } });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  const b = await req.json();
  run("UPDATE assets SET label=COALESCE(?,label), description=COALESCE(?,description) WHERE id=? AND workspace_id=?", b.label?.slice(0, 80) ?? null, b.description?.slice(0, 300) ?? null, id, s.workspaceId);
  return json({ ok: true });
});

export const DELETE = handle(async (_: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  run("DELETE FROM assets WHERE id=? AND workspace_id=?", id, s.workspaceId);
  return json({ ok: true });
});
