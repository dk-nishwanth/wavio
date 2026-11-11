import { all, get, id, now, run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/billing";
import { handle, json } from "@/lib/http";
import { enqueue } from "@/lib/queue";

export const GET = handle(async () => {
  const s = await requireSession();
  const rows = all<any>(
    `SELECT c.*, t.name AS template_name,
      (SELECT COUNT(*) FROM messages m WHERE m.campaign_id=c.id AND m.status IN ('sent','delivered','read')) AS sent,
      (SELECT COUNT(*) FROM messages m WHERE m.campaign_id=c.id AND m.status IN ('delivered','read')) AS delivered,
      (SELECT COUNT(*) FROM messages m WHERE m.campaign_id=c.id AND m.status='read') AS read,
      (SELECT COUNT(*) FROM messages m WHERE m.campaign_id=c.id AND m.status='failed') AS failed
     FROM campaigns c LEFT JOIN templates t ON t.id=c.template_id WHERE c.workspace_id=? ORDER BY c.created_at DESC`, s.workspaceId);
  return json(rows);
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  const tpl = get<any>("SELECT * FROM templates WHERE id=? AND workspace_id=?", b.templateId, s.workspaceId);
  if (!tpl) return json({ error: "Template not found" }, 404);
  if (tpl.status !== "APPROVED") return json({ error: "Template must be APPROVED" }, 409);
  const cid = id("cmp_");
  const when = b.scheduledAt ? new Date(b.scheduledAt).getTime() : null;
  const later = when && when > now() + 30_000;
  if (later) assertCan(s.workspaceId, "schedule");
  run("INSERT INTO campaigns (id, workspace_id, name, template_id, segment_tag, status, scheduled_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
    cid, s.workspaceId, b.name || "Untitled campaign", tpl.id, b.segmentTag || null, later ? "scheduled" : "sending", later ? when : null, now());
  if (!later) enqueue("campaign_dispatch", { campaignId: cid }, { workspaceId: s.workspaceId });
  return json({ id: cid });
});
