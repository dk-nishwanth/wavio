import { get, run } from "./db";
import { upsertContact } from "./core";
import { ingestEvent } from "./events";
import { logActivity, touchLead } from "./crm";

export type MetaCfg = { page_token?: string; calcom_secret?: string; zoho?: { client_id: string; client_secret: string; refresh_token: string; region: string } };
export const metaCfg = (ws: string): MetaCfg => JSON.parse(get<any>("SELECT meta_json FROM workspaces WHERE id=?", ws)?.meta_json ?? "{}");
export const saveMetaCfg = (ws: string, c: MetaCfg) => run("UPDATE workspaces SET meta_json=? WHERE id=?", JSON.stringify(c), ws);

/** Turns Meta Lead Ad "field_data" into a contact. Meta's form field names vary, so match loosely. */
export function contactFromFields(fields: { name: string; values: string[] }[]) {
  const val = (...keys: string[]) => fields.find((f) => keys.some((k) => f.name.toLowerCase().includes(k)))?.values?.[0];
  const extra: Record<string, string> = {};
  for (const f of fields) if (!/phone|email|name/i.test(f.name)) extra[f.name.toLowerCase().replace(/\W+/g, "_")] = f.values?.[0] ?? "";
  return { phone: val("phone"), name: val("full_name", "name"), email: val("email"), extra };
}

export async function handleLeadgen(ws: string, leadgenId: string, formId?: string) {
  const token = metaCfg(ws).page_token;
  if (!token) throw new Error("No Meta page access token saved");
  const res = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15_000) });
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error?.message || `Meta error ${res.status}`);
  return ingestLeadFields(ws, d.field_data ?? [], { leadgenId, formId });
}

/** Shared by the real webhook and the test endpoint. */
export function ingestLeadFields(ws: string, fields: { name: string; values: string[] }[], meta: { leadgenId?: string; formId?: string } = {}) {
  const f = contactFromFields(fields);
  if (!f.phone) throw new Error("Lead has no phone number");
  // submitting an instant form asking to be contacted counts as consent to reach out
  const c = upsertContact(ws, { phone: f.phone, name: f.name, email: f.email, attrs: { ...f.extra, lead_form_id: meta.formId ?? "" }, tags: ["meta-lead"], optedIn: true });
  touchLead(ws, c.id, "meta_lead_form");
  logActivity(ws, c.id, "lead", "Submitted a Meta lead form");
  ingestEvent(ws, { name: "lead_form_submitted", phone: c.phone, payload: { form_id: meta.formId ?? "", ...f.extra }, idempotencyKey: meta.leadgenId ? `lead-${meta.leadgenId}` : undefined });
  return c;
}
