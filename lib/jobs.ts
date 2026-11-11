import { deliverMessage, deliverWebhook, dispatchCampaign } from "./core";
import { runStep, shouldCancel } from "./automation";
import { execFlow, runCancelled } from "./flow";
import { run as sql } from "./db";
import { all, run } from "./db";
import * as wa from "./wa";
import { pushLeadToZoho } from "./zoho";

type Handler = (payload: any, job: any) => Promise<void> | void;

export const handlers: Record<string, Handler> = {
  send_message: (p) => deliverMessage(p.messageId),
  webhook_out: (p) => deliverWebhook(p),
  campaign_dispatch: (p) => dispatchCampaign(p.campaignId),
  automation_step: async (p) => {
    // a wait step carries cancelIfEvent: abort the whole run when e.g. "order_placed" arrived during an abandoned-cart delay
    if (shouldCancel(p)) return;
    await runStep(p);
  },
  zoho_push: (p) => pushLeadToZoho(p.workspaceId, p.contactId),
  flow_step: async (p) => {
    if (p.cancelEvent && runCancelled(p.runId, p.cancelEvent)) return void sql("UPDATE flow_runs SET status='done', updated_at=? WHERE id=?", Date.now(), p.runId);
    await execFlow(p.runId, p.nodeId);
  },
  sync_templates: async (p) => {
    const cfg = wa.waConfig(p.workspaceId);
    for (const t of await wa.fetchTemplateStatuses(cfg)) {
      run("UPDATE templates SET status=? WHERE workspace_id=? AND name=? AND language=?", t.status, p.workspaceId, t.name, t.language);
    }
  },
};

/** Periodic housekeeping: queue a campaign when its schedule is due. */
export function tickScheduler() {
  const due = all<any>("SELECT id FROM campaigns WHERE status='scheduled' AND scheduled_at <= ?", Date.now());
  for (const c of due) {
    run("UPDATE campaigns SET status='sending' WHERE id=?", c.id);
    dispatchCampaign(c.id);
  }
}
