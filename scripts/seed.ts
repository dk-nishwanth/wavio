// Creates a local dev account. Usage: npm run seed -- <username> <password> [workspace]
import crypto from "node:crypto";
import fs from "node:fs";
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
async function main() {
  const { get, id, now, run } = await import("../lib/db");
  const { hashPassword } = await import("../lib/auth");
  const { createKey } = await import("../lib/apikeys");
  const [user, password, workspace = "My workspace"] = process.argv.slice(2);
  if (!user || !password) throw new Error("usage: npm run seed -- <username> <password> [workspace]");
  if (get("SELECT 1 FROM users WHERE email=?", user.toLowerCase())) return console.log("User already exists");
  const ws = id("ws_");
  run("INSERT INTO workspaces (id, name, wa_verify_token, created_at) VALUES (?,?,?,?)", ws, workspace, crypto.randomBytes(16).toString("hex"), now());
  run("INSERT INTO users (id, workspace_id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)", id("u_"), ws, user.toLowerCase(), user, hashPassword(password), "admin", now());
  createKey(ws, "public", "Website (public)");
  createKey(ws, "secret", "Server (secret)");
  console.log(`Created user "${user}"`);
}
main();
