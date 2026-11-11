import crypto from "node:crypto";
import { cookies } from "next/headers";
import { get } from "./db";

const secret = () => {
  const s = process.env.APP_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-secret");
  if (!s) throw new Error("APP_SECRET is not set");
  return s;
};
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (v: string) => crypto.createHmac("sha256", secret()).update(v).digest("base64url");

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(pw, salt, 32).toString("hex");
}
export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(pw, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(test));
}

export function makeSession(userId: string, version = 0) {
  const body = b64(JSON.stringify({ u: userId, v: version, exp: Date.now() + 14 * 864e5 }));
  return body + "." + sign(body);
}

export type Session = { userId: string; workspaceId: string; role: string; name: string; email: string };

export async function getSession(): Promise<Session | null> {
  const c = (await cookies()).get("session")?.value;
  if (!c) return null;
  const [body, sig] = c.split(".");
  if (!body || !sig || sign(body) !== sig) return null;
  const { u, exp, v } = JSON.parse(Buffer.from(body, "base64url").toString());
  if (exp < Date.now()) return null;
  const user = get<any>("SELECT * FROM users WHERE id = ?", u);
  if (!user || (user.session_version ?? 0) !== (v ?? 0)) return null; // password changes sign every device out
  return { userId: user.id, workspaceId: user.workspace_id, role: user.role, name: user.name, email: user.email };
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Unauthorized");
  return s;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const COOKIE = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 14 * 86400, secure: process.env.NODE_ENV === "production" };

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
