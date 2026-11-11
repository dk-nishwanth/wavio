import { get, run } from "@/lib/db";
import { hashPassword, requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Admin sets a new password for a teammate (no email service needed). Signs that user out everywhere. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const s = await requireSession();
  const { id } = await params;
  if (s.role !== "admin") throw new HttpError(403, "Only admins can reset passwords");
  const u = get<any>("SELECT * FROM users WHERE id=? AND workspace_id=?", id, s.workspaceId);
  if (!u) throw new HttpError(404, "Not found");
  const { password } = await req.json();
  if (String(password ?? "").length < 8) throw new HttpError(400, "Password must be at least 8 characters");
  run("UPDATE users SET password_hash=?, session_version=? WHERE id=?", hashPassword(password), (u.session_version ?? 0) + 1, id);
  return json({ ok: true });
});
