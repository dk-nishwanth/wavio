import { all } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { ALL_ACTIONS, getAgent, repliesThisMonth } from "@/lib/ai";
import { aiConfigured, DEFAULT_MODEL } from "@/lib/llm";
import { AUTO_APPROVABLE, autoApprove } from "@/lib/requests";
import { metaCfg, saveMetaCfg } from "@/lib/metaleads";
import { encrypt } from "@/lib/crypto";
import { run } from "@/lib/db";

export const GET = handle(async () => {
  const s = await requireSession();
  const a = getAgent(s.workspaceId);
  const usage = all<any>("SELECT COUNT(*) replies, COALESCE(SUM(input_tokens),0) input, COALESCE(SUM(output_tokens),0) output, COALESCE(SUM(escalated),0) escalated FROM ai_usage WHERE workspace_id=? AND created_at > ?", s.workspaceId, Date.now() - 30 * 864e5)[0];
  return json({
    agent: { ...a, actions: JSON.parse(a.actions) }, allActions: ALL_ACTIONS, autoApprovable: AUTO_APPROVABLE, autoApprove: autoApprove(s.workspaceId),
    configured: aiConfigured(s.workspaceId), keySource: (metaCfg(s.workspaceId) as any).ai_key ? "workspace" : process.env.ANTHROPIC_API_KEY ? "server" : null,
    defaultModel: process.env.AI_MODEL || DEFAULT_MODEL, repliesThisMonth: repliesThisMonth(s.workspaceId), usage30d: usage,
  });
});

export const PUT = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  const a = getAgent(s.workspaceId);
  const actions = Array.isArray(b.actions) ? b.actions.filter((x: string) => (ALL_ACTIONS as readonly string[]).includes(x)) : JSON.parse(a.actions);
  run(`UPDATE ai_agents SET name=?, mode=?, instructions=?, greeting=?, model=?, temperature=?, enabled=?, auto_reply=?, actions=?, monthly_credit_limit=?, engine=? WHERE id=?`,
    String(b.name ?? a.name).slice(0, 60), ["support", "sales", "qa"].includes(b.mode) ? b.mode : a.mode, String(b.instructions ?? a.instructions).slice(0, 6000), String(b.greeting ?? a.greeting).slice(0, 500),
    b.model ? String(b.model).slice(0, 80) : null, Math.min(1, Math.max(0, Number(b.temperature ?? a.temperature))), b.enabled ? 1 : 0, b.auto_reply ? 1 : 0, JSON.stringify(actions),
    b.monthly_credit_limit ? Math.max(1, Math.floor(Number(b.monthly_credit_limit))) : null, ["rules", "ai", "hybrid"].includes(b.engine) ? b.engine : a.engine, a.id);
  const cfg = metaCfg(s.workspaceId) as any;
  let changed = false;
  if (Array.isArray(b.autoApprove)) { cfg.ai = { ...(cfg.ai ?? {}), auto_approve: b.autoApprove.filter((k: string) => (AUTO_APPROVABLE as string[]).includes(k)) }; changed = true; }
  if (b.aiKey) { cfg.ai_key = encrypt(String(b.aiKey).trim()); changed = true; }
  if (b.clearAiKey) { delete cfg.ai_key; changed = true; }
  if (changed) saveMetaCfg(s.workspaceId, cfg);
  return json({ ok: true });
});
