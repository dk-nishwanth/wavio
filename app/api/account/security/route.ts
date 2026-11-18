import { get } from "@/lib/db";
import { requireSession, verifyPassword } from "@/lib/auth";
import { handle, json } from "@/lib/http";

const COMMON = ["password", "12345678", "123456789", "admin123", "welcome1", "qwerty123", "password1", "wavio123", "jawai123"];

/** Used once per page load to nudge people off easy passwords (the same as their username, or a well-known one). */
export const GET = handle(async () => {
  const s = await requireSession();
  const u = get<any>("SELECT password_hash FROM users WHERE id=?", s.userId)!;
  const weak = [s.email, s.name, ...COMMON].some((p) => p && verifyPassword(String(p), u.password_hash));
  return json({ weakPassword: weak });
});
