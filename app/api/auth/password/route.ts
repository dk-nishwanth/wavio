import { get, run } from "@/lib/db";
import { COOKIE, hashPassword, makeSession, requireSession, verifyPassword, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { hit } from "@/lib/ratelimit";

/** Change your own password. Signs out every other device and keeps this one signed in. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  if (!hit(`pw:${s.userId}`, 10, 3600_000).ok) throw new HttpError(429, "Too many attempts");
  const { current, next } = await req.json();
  const u = get<any>("SELECT * FROM users WHERE id=?", s.userId)!;
  if (!verifyPassword(String(current ?? ""), u.password_hash)) throw new HttpError(400, "Current password is incorrect");
  if (String(next ?? "").length < 8) throw new HttpError(400, "New password must be at least 8 characters");
  const version = (u.session_version ?? 0) + 1;
  run("UPDATE users SET password_hash=?, session_version=? WHERE id=?", hashPassword(next), version, s.userId);
  const res = json({ ok: true });
  res.cookies.set("session", makeSession(s.userId, version), COOKIE);
  return res;
});
