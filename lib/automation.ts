import { all, get, now, run } from "./db";
import { enqueue } from "./queue";
import { setStage } from "./crm";
import { startFlow } from "./flow";

export type Step =
  | { type: "send_text"; text: string }
  | { type: "send_template"; template: string; params?: string[] }
  | { type: "buttons"; text: string; buttons: string[] }
  | { type: "wait"; minutes: number; unless_event?: string }
  | { type: "tag"; tag: string }
  | { type: "assign"; user_id: string }
  | { type: "set_stage"; stage: string }
  | { type: "http"; url: string };

type Ctx = { event?: Record<string, any>; text?: string };

/** Finds active automations for this trigger and queues step 0 of each. */
export function startAutomations(ws: string, contactId: string, type: "event" | "keyword" | "first_message", ctx: Ctx & { name?: string }): number {
  let started = 0;
  const rows = all<any>("SELECT * FROM automations WHERE workspace_id=? AND active=1 AND trigger_type=?", ws, type);
  for (const a of rows) {
    const vals = String(a.trigger_value).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    let match = false;
    if (type === "event") match = vals.includes(String(ctx.name).toLowerCase());
    else if (type === "keyword") {
      const t = (ctx.text ?? "").trim().toLowerCase();
      match = vals.some((v) => t === v || t.includes(v));
    } else match = true;
    if (match) started++;
    if (match && a.graph) startFlow(a, contactId, { event: ctx.event, text: ctx.text });
    else if (match) enqueue("automation_step", { automationId: a.id, contactId, index: 0, startedAt: now(), ctx: { event: ctx.event, text: ctx.text } }, { workspaceId: ws });
  }
  return started;
}

const lookup = (obj: any, path: string) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

function interpolate(s: string, contact: any, ctx: Ctx) {
  const data = { contact: { ...contact, ...JSON.parse(contact.attrs ?? "{}") }, event: ctx.event ?? {} };
  return s.replace(/\{\{\s*(contact|event)\.([\w.]+)\s*\}\}/g, (_, root, p) => String(lookup((data as any)[root], p) ?? ""));
}

export async function runStep(p: { automationId: string; contactId: string; index: number; startedAt: number; ctx: Ctx }) {
  const { queueText, queueTemplate, queueButtons } = await import("./core");
  const a = get<any>("SELECT * FROM automations WHERE id=?", p.automationId);
  if (!a || !a.active) return;
  const steps: Step[] = JSON.parse(a.steps);
  const contact = get<any>("SELECT * FROM contacts WHERE id=?", p.contactId);
  if (!contact) return;
  const step = steps[p.index];
  if (!step) return;
  const ws = a.workspace_id;
  const next = (runAt = now()) =>
    p.index + 1 < steps.length &&
    enqueue("automation_step", { ...p, index: p.index + 1 }, { workspaceId: ws, runAt });

  switch (step.type) {
    case "send_text":
      queueText(ws, contact.id, interpolate(step.text, contact, p.ctx));
      break;
    case "send_template":
      queueTemplate(ws, contact.id, step.template, (step.params ?? []).map((x) => interpolate(x, contact, p.ctx)));
      break;
    case "buttons":
      queueButtons(ws, contact.id, interpolate(step.text, contact, p.ctx), step.buttons);
      break;
    case "tag": {
      const tags = [...new Set([...JSON.parse(contact.tags), step.tag])];
      run("UPDATE contacts SET tags=? WHERE id=?", JSON.stringify(tags), contact.id);
      break;
    }
    case "set_stage":
      setStage(ws, contact.id, step.stage);
      break;
    case "assign":
      run("UPDATE conversations SET assigned_to=? WHERE contact_id=?", step.user_id, contact.id);
      break;
    case "http":
      await fetch(step.url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: { id: contact.id, phone: contact.phone, name: contact.name }, ctx: p.ctx }),
        signal: AbortSignal.timeout(10_000),
      });
      break;
    case "wait": {
      // enqueue the following step later; a "check" job aborts if the cancelling event happened meanwhile
      if (p.index + 1 < steps.length) {
        enqueue(
          "automation_step",
          { ...p, index: p.index + 1, cancelIfEvent: step.unless_event, waitFrom: now() },
          { workspaceId: ws, runAt: now() + step.minutes * 60_000 },
        );
      }
      return;
    }
  }
  next();
}

export function shouldCancel(p: { contactId: string; cancelIfEvent?: string; waitFrom?: number; startedAt: number }) {
  if (!p.cancelIfEvent) return false;
  return !!get(
    "SELECT 1 FROM events WHERE contact_id=? AND name=? AND created_at >= ?",
    p.contactId, p.cancelIfEvent, p.startedAt,
  );
}
