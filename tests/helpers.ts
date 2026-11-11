import { id, now, run } from "../lib/db";
import { hashPassword } from "../lib/auth";

export function makeWorkspace(name = "Test Resort") {
  const ws = id("ws_");
  run("INSERT INTO workspaces (id, name, wa_verify_token, created_at) VALUES (?,?,?,?)", ws, name, "verify", now());
  const uid = id("u_");
  run("INSERT INTO users (id, workspace_id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)", uid, ws, `u${uid}@t.test`, "Agent", hashPassword("password123"), "admin", now());
  return { ws, uid };
}

export function makeTemplate(ws: string, name: string, body: string, status = "APPROVED") {
  run("INSERT INTO templates (id, workspace_id, name, language, category, body, status, created_at) VALUES (?,?,?,?,?,?,?,?)", id("t_"), ws, name, "en", "UTILITY", body, status, now());
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
