import { get } from "@/lib/db";
import { makeSession, verifyPassword } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const { email, password } = await req.json();
  const u = get<any>("SELECT * FROM users WHERE email=?", String(email ?? "").toLowerCase());
  if (!u || !verifyPassword(String(password ?? ""), u.password_hash)) return json({ error: "Invalid email or password" }, 401);
  const res = json({ ok: true });
  res.cookies.set("session", makeSession(u.id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 14 * 86400, secure: process.env.NODE_ENV === "production" });
  return res;
});
