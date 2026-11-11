import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { db } from "./db";

const dir = () => path.resolve(process.env.BACKUP_DIR || "./backups");
const keep = () => Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
const stamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);

/** Consistent online snapshot of the live database (VACUUM INTO), verified before it counts. */
export function backupNow(): string {
  fs.mkdirSync(dir(), { recursive: true });
  const file = path.join(dir(), `wavio-${stamp()}.db`);
  if (fs.existsSync(file)) fs.rmSync(file);
  db().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const check = new DatabaseSync(file);
  const ok = (check.prepare("PRAGMA integrity_check").get() as any).integrity_check === "ok";
  check.close();
  if (!ok) { fs.rmSync(file); throw new Error("Backup failed its integrity check"); }
  const all = fs.readdirSync(dir()).filter((f) => /^wavio-\d+\.db$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep()))) fs.rmSync(path.join(dir(), old));
  return file;
}

export const lastBackupAt = (): number | null => {
  if (!fs.existsSync(dir())) return null;
  const f = fs.readdirSync(dir()).filter((x) => /^wavio-\d+\.db$/.test(x)).sort().pop();
  return f ? fs.statSync(path.join(dir(), f)).mtimeMs : null;
};
