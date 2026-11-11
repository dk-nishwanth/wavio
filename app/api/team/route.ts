import { all, get, id, now, run } from "@/lib/db";
import { requireSession, hashPassword, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { assertCan } from "@/lib/billing";

export const GET = handle(async () => {
  const s = await requireSession();
  return json(all("SELECT id, name, email, role, created_at FROM users WHERE workspace_id=? ORDER BY created_at", s.workspaceId));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  if (s.role !== "admin") throw new HttpError(403, "Only admins can add users");
  const b = await req.json();
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!email || String(b.password ?? "").length < 8) throw new HttpError(400, "Email/username and a password of 8+ characters are required");
  if (get("SELECT 1 FROM users WHERE email=?", email)) throw new HttpError(409, "That email/username is already taken");
  assertCan(s.workspaceId, "seat");
  run("INSERT INTO users (id, workspace_id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)", id("u_"), s.workspaceId, email, b.name || email, hashPassword(b.password), b.role === "admin" ? "admin" : "agent", now());
  return json({ ok: true });
});
