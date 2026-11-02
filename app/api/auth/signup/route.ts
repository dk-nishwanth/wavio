import crypto from "node:crypto";
import { id, now, run, get } from "@/lib/db";
import { hashPassword, makeSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { createKey } from "@/lib/apikeys";

export const POST = handle(async (req: Request) => {
  const { name, email, password, workspace } = await req.json();
  if (!email || !password || password.length < 8) return json({ error: "Email and a password of 8+ characters are required" }, 400);
  if (get("SELECT 1 FROM users WHERE email=?", String(email).toLowerCase())) return json({ error: "Email already registered" }, 409);
  const ws = id("ws_");
  run("INSERT INTO workspaces (id, name, wa_verify_token, created_at) VALUES (?,?,?,?)", ws, workspace || "My workspace", crypto.randomBytes(16).toString("hex"), now());
  const uid = id("u_");
  run("INSERT INTO users (id, workspace_id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)", uid, ws, String(email).toLowerCase(), name || email, hashPassword(password), "admin", now());
  createKey(ws, "public", "Website (public)");
  createKey(ws, "secret", "Server (secret)");
  const res = json({ ok: true });
  res.cookies.set("session", makeSession(uid), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 14 * 86400, secure: process.env.NODE_ENV === "production" });
  return res;
});
