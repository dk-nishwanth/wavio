import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { resetTestData } from "@/lib/reset";
import { audit } from "@/lib/audit";
import { backupNow } from "@/lib/backup";

/** Admin only, and only with the typed phrase. A backup is taken first so it can be undone. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  if (s.role !== "admin") throw new HttpError(403, "Only admins can do this");
  const b = await req.json();
  if (b.confirm !== "DELETE TEST DATA") throw new HttpError(400, 'Type DELETE TEST DATA to confirm');
  const backup = backupNow();
  const counts = resetTestData(s.workspaceId);
  audit(s, "reset.test-data", `${counts.contacts} guests removed; backup ${backup.split("/").pop()}`);
  return json({ ok: true, counts, backup: backup.split("/").pop() });
});
