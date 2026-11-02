import crypto from "node:crypto";
import { all, id, now, run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const s = await requireSession();
  return json(all("SELECT id, url, secret FROM outbound_webhooks WHERE workspace_id=?", s.workspaceId));
});
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const { url } = await req.json();
  if (!/^https?:\/\//.test(url ?? "")) return json({ error: "Valid URL required" }, 400);
  run("INSERT INTO outbound_webhooks (id, workspace_id, url, secret, created_at) VALUES (?,?,?,?,?)", id("wh_"), s.workspaceId, url, crypto.randomBytes(20).toString("hex"), now());
  return json({ ok: true });
});
export const DELETE = handle(async (req: Request) => {
  const s = await requireSession();
  const { id: hid } = await req.json();
  run("DELETE FROM outbound_webhooks WHERE id=? AND workspace_id=?", hid, s.workspaceId);
  return json({ ok: true });
});
