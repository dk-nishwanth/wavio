import { get } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { pendingRequests } from "@/lib/requests";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const s = await requireSession();
  const q = (sql: string) => get<any>(sql, s.workspaceId)!.n as number;
  const since = Date.now() - 7 * 864e5;
  return json({
    contacts: q("SELECT COUNT(*) n FROM contacts WHERE workspace_id=?"),
    optedIn: q("SELECT COUNT(*) n FROM contacts WHERE workspace_id=? AND opted_in=1"),
    openConversations: q("SELECT COUNT(*) n FROM conversations WHERE workspace_id=? AND status='open' AND last_message_at IS NOT NULL"),
    unread: q("SELECT COUNT(*) n FROM conversations WHERE workspace_id=? AND unread>0"),
    pendingRequests: pendingRequests(s.workspaceId),
    sent7d: get<any>("SELECT COUNT(*) n FROM messages WHERE workspace_id=? AND direction='out' AND is_note=0 AND created_at>?", s.workspaceId, since)!.n,
    received7d: get<any>("SELECT COUNT(*) n FROM messages WHERE workspace_id=? AND direction='in' AND created_at>?", s.workspaceId, since)!.n,
    failed7d: get<any>("SELECT COUNT(*) n FROM messages WHERE workspace_id=? AND status='failed' AND created_at>?", s.workspaceId, since)!.n,
    pendingJobs: q("SELECT COUNT(*) n FROM jobs WHERE (workspace_id=? OR workspace_id IS NULL) AND status IN ('pending','running')"),
  });
});
