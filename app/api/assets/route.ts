import { all, id, now, run } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { checkUpload, extFor, saveFile } from "@/lib/media";

/** The media library: room photos, brochures, menus. The AI concierge can send these by name. */
export const GET = handle(async () => {
  const s = await requireSession();
  return json(all("SELECT id, kind, name, label, description, mime, created_at FROM assets WHERE workspace_id=? ORDER BY created_at DESC", s.workspaceId));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  const rule = checkUpload(mime, file.size);
  const aid = id("as_");
  const rel = saveFile(s.workspaceId, aid, extFor(mime), Buffer.from(await file.arrayBuffer()));
  const label = String(form.get("label") ?? "").trim().slice(0, 80) || file.name.replace(/\.[^.]+$/, "").slice(0, 80);
  run("INSERT INTO assets (id, workspace_id, path, mime, name, kind, label, description, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    aid, s.workspaceId, rel, mime, file.name.replace(/[^\w.\- ]/g, "_").slice(0, 80), rule.kind, label, String(form.get("description") ?? "").slice(0, 300), now());
  return json({ id: aid });
});
