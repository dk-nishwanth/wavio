// Sets a new password for any user (recovery when no admin can sign in). Usage: npm run reset-password -- <username> <new-password>
import fs from "node:fs";
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
async function main() {
  const { get, run } = await import("../lib/db");
  const { hashPassword } = await import("../lib/auth");
  const [user, password] = process.argv.slice(2);
  if (!user || !password || password.length < 8) throw new Error("usage: npm run reset-password -- <username> <new-password (8+ chars)>");
  const u = get<any>("SELECT * FROM users WHERE email=?", user.toLowerCase());
  if (!u) throw new Error("No such user");
  run("UPDATE users SET password_hash=?, session_version=? WHERE id=?", hashPassword(password), (u.session_version ?? 0) + 1, u.id);
  console.log(`Password updated for "${user}". All their sessions were signed out.`);
}
main();
