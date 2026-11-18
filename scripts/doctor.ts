// Pre-flight check for going live. Usage: npm run doctor   (exits 1 if anything critical is wrong)
import fs from "node:fs";
for (const f of [".env.local", ".env", ".env.production"]) {
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
type Row = [level: "ok" | "warn" | "fail", what: string, detail?: string];
const rows: Row[] = [];
const add = (level: Row[0], what: string, detail?: string) => rows.push([level, what, detail]);

async function main() {
  const prod = process.env.NODE_ENV === "production";
  const major = Number(process.versions.node.split(".")[0]);
  add(major >= 22 ? "ok" : "fail", `Node ${process.versions.node}`, major >= 22 ? undefined : "Node 22 or newer is required (built-in SQLite)");

  const secret = process.env.APP_SECRET ?? "";
  const weak = !secret || secret.length < 32 || ["change-me", "dev-secret", "secret"].includes(secret);
  add(weak ? (prod ? "fail" : "warn") : "ok", "APP_SECRET", weak ? "use 32+ random characters (openssl rand -base64 36)" : undefined);
  add(!process.env.CRON_SECRET || process.env.CRON_SECRET === "change-me" ? (prod ? "fail" : "warn") : "ok", "CRON_SECRET");
  const url = process.env.APP_URL ?? "";
  add(url.startsWith("https://") ? "ok" : prod ? "fail" : "warn", "APP_URL", url.startsWith("https://") ? url : "must be your public https address (WhatsApp webhooks and payment links use it)");
  add(process.env.ENCRYPTION_KEY ? "ok" : "warn", "ENCRYPTION_KEY", process.env.ENCRYPTION_KEY ? undefined : "not set: saved tokens are encrypted with APP_SECRET, so changing APP_SECRET later would lock them");
  add(process.env.ALLOW_DEV_TOOLS === "1" ? "warn" : "ok", "Test tools", process.env.ALLOW_DEV_TOOLS === "1" ? "ALLOW_DEV_TOOLS=1 exposes simulators; remove it in production" : "off");

  const { db, get, all } = await import("../lib/db");
  try {
    const ok = (db().prepare("PRAGMA integrity_check").get() as any).integrity_check === "ok";
    add(ok ? "ok" : "fail", "Database", ok ? process.env.DATABASE_PATH || "./data/app.db" : "integrity check failed — restore a backup");
  } catch (e: any) { add("fail", "Database", e.message); return; }

  const { lastBackupAt } = await import("../lib/backup");
  const bk = lastBackupAt();
  add(bk && Date.now() - bk < 36 * 3600_000 ? "ok" : "warn", "Backups", bk ? `last ${new Date(bk).toLocaleString()}` : "none yet — they start automatically once the server runs, or run npm run backup");
  try { const { mediaRoot } = await import("../lib/media"); fs.mkdirSync(mediaRoot(), { recursive: true }); fs.accessSync(mediaRoot(), fs.constants.W_OK); add("ok", "Media folder writable", mediaRoot()); } catch (e: any) { add("fail", "Media folder", e.message); }

  const ws = get<any>("SELECT id, name FROM workspaces ORDER BY created_at LIMIT 1");
  if (!ws) { add("fail", "Workspace", "none yet — sign up or run npm run seed"); return; }
  const { setupStatus } = await import("../lib/setup");
  const st = setupStatus(ws.id);
  for (const s of st.steps) add(s.done ? "ok" : s.key === "whatsapp" ? "warn" : "warn", s.title, s.done ? undefined : "not done yet");
  const { waConfig } = await import("../lib/wa");
  const wa = waConfig(ws.id);
  if (wa.token) { try { const { checkConnection } = await import("../lib/wa"); const c = await checkConnection(wa); add("ok", "WhatsApp connection", `${c.displayPhone} · ${c.verifiedName} · quality ${c.quality}`); } catch (e: any) { add("fail", "WhatsApp connection", e.message); } }
  const { alertCfg } = await import("../lib/alerts");
  const a = alertCfg(ws.id);
  add(a.email?.host || a.telegram?.bot_token ? "ok" : "warn", "Alerts", a.email?.host || a.telegram?.bot_token ? "configured" : "no email or Telegram set — you won't be told when a guest needs a person");
  const { verifyPassword } = await import("../lib/auth");
  const weakUsers = all<any>("SELECT email, password_hash FROM users").filter((u) => verifyPassword(u.email, u.password_hash) || verifyPassword("password", u.password_hash)).map((u) => u.email);
  add(weakUsers.length ? (prod ? "fail" : "warn") : "ok", "Passwords", weakUsers.length ? `weak password for: ${weakUsers.join(", ")}` : undefined);
  const test = get<any>("SELECT COUNT(*) n FROM contacts WHERE workspace_id=?", ws.id)!.n;
  add(test > 0 ? "warn" : "ok", "Guests in database", test > 0 ? `${test} — if these are all practice guests, clear them in Settings → Your data` : "none");
}

main().then(() => {
  const icon = { ok: "✓", warn: "!", fail: "✗" } as const;
  for (const [l, w, d] of rows) console.log(`${icon[l]} ${w}${d ? ` — ${d}` : ""}`);
  const fails = rows.filter((r) => r[0] === "fail").length, warns = rows.filter((r) => r[0] === "warn").length;
  console.log(`\n${fails ? `${fails} problem(s) to fix` : "No blocking problems"}${warns ? `, ${warns} thing(s) to review` : ""}.`);
  process.exit(fails ? 1 : 0);
});
