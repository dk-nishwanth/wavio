import fs from "node:fs";
import { requireSession, HttpError } from "@/lib/auth";
import { backupNow, lastBackupAt } from "@/lib/backup";
import { handle, json } from "@/lib/http";
import { audit } from "@/lib/audit";

export const GET = handle(async () => {
  const s = await requireSession();
  return json({ lastBackupAt: lastBackupAt() });
});

/** Admin: takes a fresh verified snapshot and downloads it. Keep it somewhere safe — it contains every guest's data. */
export const POST = handle(async () => {
  const s = await requireSession();
  if (s.role !== "admin") throw new HttpError(403, "Only admins can download a backup");
  const file = backupNow();
  audit(s, "backup.download");
  return new Response(new Uint8Array(fs.readFileSync(file)), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${file.split("/").pop()}"`, "Cache-Control": "no-store" } });
});
