import { get, run } from "@/lib/db";
import { COOKIE, makeSession, verifyPassword } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { clear, clientIp, hit, isBlocked } from "@/lib/ratelimit";

const FAILS = 5, WINDOW = 15 * 60_000;

export const POST = handle(async (req: Request) => {
  const { email, password } = await req.json();
  const name = String(email ?? "").toLowerCase().trim();
  const ipKey = `login-ip:${clientIp(req)}`, userKey = `login-user:${name}`;
  if (isBlocked(userKey, FAILS) || isBlocked(ipKey, FAILS * 4)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  const u = get<any>("SELECT * FROM users WHERE email=?", name);
  if (!u || !verifyPassword(String(password ?? ""), u.password_hash)) {
    hit(userKey, FAILS, WINDOW); hit(ipKey, FAILS * 4, WINDOW);
    return json({ error: "Invalid email or password" }, 401);
  }
  clear(userKey);
  const res = json({ ok: true });
  res.cookies.set("session", makeSession(u.id, u.session_version ?? 0), COOKIE);
  void run;
  return res;
});
