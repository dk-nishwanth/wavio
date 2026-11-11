import { backupNow, lastBackupAt } from "./backup";
import { purgeExpired } from "./ratelimit";

let last = 0;
/** Cheap housekeeping called from the job loop: expired rate-limit rows hourly, a database backup once a day. */
export function maintenance() {
  if (Date.now() - last < 3600_000) return;
  last = Date.now();
  purgeExpired();
  if (process.env.AUTO_BACKUP === "0") return;
  const at = lastBackupAt();
  if (!at || Date.now() - at > 24 * 3600_000) {
    try { console.log("backup written:", backupNow()); } catch (e) { console.error("backup failed", e); }
  }
}
