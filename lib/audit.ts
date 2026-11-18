import { all, id, now, run } from "./db";
import type { Session } from "./auth";

/** Records who did what (settings changes, approvals, deletions, sign-ins) so admins can trace mistakes. */
export function audit(s: Pick<Session, "workspaceId" | "userId" | "name">, action: string, detail = "") {
  run("INSERT INTO audit_log (id, workspace_id, user_id, user_name, action, detail, created_at) VALUES (?,?,?,?,?,?,?)", id("au_"), s.workspaceId, s.userId, s.name, action, detail.slice(0, 300), now());
}
export const recentAudit = (ws: string, limit = 200) => all<any>("SELECT * FROM audit_log WHERE workspace_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?", ws, limit);
