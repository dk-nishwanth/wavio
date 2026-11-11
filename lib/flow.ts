import { all, get, id, now, run } from "./db";
import { enqueue } from "./queue";
import { logActivity, setStage } from "./crm";

export type FlowNode = { id: string; type: string; x: number; y: number; data: Record<string, any> };
export type FlowEdge = { id: string; from: string; port: string; to: string };
export type Graph = { nodes: FlowNode[]; edges: FlowEdge[] };

const WINDOW = 24 * 3600 * 1000;
const lookup = (o: any, path: string) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);

function render(text: string, contact: any, vars: any) {
  const data = { contact: { ...contact, ...JSON.parse(contact.attrs ?? "{}") }, event: vars.event ?? {}, vars: vars.vars ?? {} };
  return String(text ?? "").replace(/\{\{\s*(contact|event|vars)\.([\w.]+)\s*\}\}/g, (_, r, p) => String(lookup((data as any)[r], p) ?? ""));
}

const next = (g: Graph, nodeId: string, port = "out") => g.edges.find((e) => e.from === nodeId && e.port === port)?.to ?? null;

/** Begin a flow for a contact right after its trigger node. */
export function startFlow(a: any, contactId: string, ctx: { event?: any; text?: string }) {
  const g: Graph = JSON.parse(a.graph);
  const trigger = g.nodes.find((n) => n.type === "trigger");
  const first = trigger && next(g, trigger.id);
  if (!first) return;
  const rid = id("fr_");
  run("INSERT INTO flow_runs (id, workspace_id, automation_id, contact_id, vars, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    rid, a.workspace_id, a.id, contactId, JSON.stringify({ event: ctx.event ?? {}, text: ctx.text, vars: {} }), now(), now());
  enqueue("flow_step", { runId: rid, nodeId: first }, { workspaceId: a.workspace_id });
}

function condition(d: any, contact: any, vars: any) {
  const tags: string[] = JSON.parse(contact.tags);
  const lead = get<any>("SELECT stage FROM leads WHERE contact_id=?", contact.id);
  const actual =
    d.field === "tag" ? tags.join(",") : d.field === "stage" ? lead?.stage ?? "" :
    d.field === "var" ? vars.vars?.[d.key] ?? "" : JSON.parse(contact.attrs)[d.key] ?? "";
  const want = String(d.value ?? "");
  if (d.field === "tag") return tags.includes(want);
  const a = String(actual).toLowerCase(), w = want.toLowerCase();
  return d.op === "contains" ? a.includes(w) : d.op === "neq" ? a !== w : a === w;
}

/** Executes nodes until the flow must wait (buttons, question, delay) or ends. */
export async function execFlow(runId: string, nodeId: string | null) {
  const { queueText, queueTemplate, queueButtons } = await import("./core");
  const r = get<any>("SELECT * FROM flow_runs WHERE id=?", runId);
  if (!r || r.status === "done" || r.status === "failed") return;
  const a = get<any>("SELECT * FROM automations WHERE id=?", r.automation_id);
  if (!a || !a.active) return run("UPDATE flow_runs SET status='done' WHERE id=?", runId);
  const g: Graph = JSON.parse(a.graph);
  const ws = r.workspace_id;
  const vars = JSON.parse(r.vars);
  const contact = () => get<any>("SELECT * FROM contacts WHERE id=?", r.contact_id)!;
  const finish = (status: string) => run("UPDATE flow_runs SET status=?, waiting_node=NULL, updated_at=? WHERE id=?", status, now(), runId);

  let cur = nodeId;
  for (let guard = 0; cur && guard < 60; guard++) {
    const n = g.nodes.find((x) => x.id === cur);
    if (!n) break;
    const d = n.data;
    const c = contact();
    try {
      switch (n.type) {
        case "send_text": queueText(ws, c.id, render(d.text, c, vars)); cur = next(g, n.id); break;
        case "send_template": queueTemplate(ws, c.id, d.template, (d.params ?? []).map((p: string) => render(p, c, vars))); cur = next(g, n.id); break;
        case "buttons":
          queueButtons(ws, c.id, render(d.text, c, vars), d.buttons ?? []);
          run("UPDATE flow_runs SET status='waiting', waiting_node=?, updated_at=? WHERE id=?", n.id, now(), runId);
          return;
        case "ask":
          queueText(ws, c.id, render(d.text, c, vars));
          run("UPDATE flow_runs SET status='waiting', waiting_node=?, updated_at=? WHERE id=?", n.id, now(), runId);
          return;
        case "wait": {
          const after = next(g, n.id);
          if (after) enqueue("flow_step", { runId, nodeId: after }, { workspaceId: ws, runAt: now() + Number(d.minutes || 0) * 60_000 });
          return;
        }
        case "condition": cur = next(g, n.id, condition(d, c, vars) ? "yes" : "no"); break;
        case "tag": {
          const tags = [...new Set([...JSON.parse(c.tags), d.tag])];
          run("UPDATE contacts SET tags=? WHERE id=?", JSON.stringify(tags), c.id); cur = next(g, n.id); break;
        }
        case "set_stage": setStage(ws, c.id, d.stage); cur = next(g, n.id); break;
        case "handoff":
          run("UPDATE conversations SET bot_paused=1, assigned_to=COALESCE(?,assigned_to) WHERE contact_id=?", d.user_id || null, c.id);
          logActivity(ws, c.id, "flow", "Flow handed the chat to a human"); cur = next(g, n.id); break;
        case "http":
          await fetch(d.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact: { id: c.id, phone: c.phone, name: c.name }, vars: vars.vars, event: vars.event }), signal: AbortSignal.timeout(10_000) });
          cur = next(g, n.id); break;
        default: cur = next(g, n.id); // trigger / end
      }
    } catch (e: any) {
      logActivity(ws, c.id, "flow", `Flow "${a.name}" stopped at ${n.type}: ${e.message}`);
      return finish("failed");
    }
  }
  finish("done");
}

/** If the contact is mid-flow (waiting on a button tap or answer), consume this inbound message. Returns true if handled. */
export async function resumeWaiting(ws: string, contactId: string, text: string): Promise<boolean> {
  const r = get<any>("SELECT * FROM flow_runs WHERE contact_id=? AND status='waiting' AND updated_at > ? ORDER BY updated_at DESC LIMIT 1", contactId, now() - WINDOW);
  if (!r) return false;
  const a = get<any>("SELECT * FROM automations WHERE id=?", r.automation_id);
  if (!a) return false;
  const g: Graph = JSON.parse(a.graph);
  const n = g.nodes.find((x) => x.id === r.waiting_node);
  if (!n) return false;
  let port = "out";
  if (n.type === "buttons") {
    const labels: string[] = n.data.buttons ?? [];
    const i = labels.findIndex((b, idx) => b.toLowerCase() === text.trim().toLowerCase() || `btn_${idx}` === text);
    port = i >= 0 ? String(i) : "other";
    if (i < 0 && !g.edges.some((e) => e.from === n.id && e.port === "other")) return false; // unrelated message: let normal triggers run
  } else if (n.type === "ask") {
    const vars = JSON.parse(r.vars);
    const key = n.data.variable || "answer";
    vars.vars = { ...(vars.vars ?? {}), [key]: text };
    run("UPDATE flow_runs SET vars=? WHERE id=?", JSON.stringify(vars), r.id);
    if (n.data.save_to_contact) {
      const c = get<any>("SELECT attrs FROM contacts WHERE id=?", contactId)!;
      run("UPDATE contacts SET attrs=? WHERE id=?", JSON.stringify({ ...JSON.parse(c.attrs), [key]: text }), contactId);
    }
  }
  run("UPDATE flow_runs SET status='running', waiting_node=NULL WHERE id=?", r.id);
  await execFlow(r.id, next(g, n.id, port));
  return true;
}

export const listRuns = (ws: string, automationId: string) =>
  all("SELECT status, COUNT(*) n FROM flow_runs WHERE workspace_id=? AND automation_id=? GROUP BY status", ws, automationId);
