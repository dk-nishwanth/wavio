import { get } from "./db";

const GRAPH = "https://graph.facebook.com/v21.0";

export class WaError extends Error {
  permanent = false;
  constructor(message: string, permanent = false) { super(message); this.permanent = permanent; }
}

export type WaConfig = { phoneNumberId: string | null; wabaId: string | null; token: string | null };

export function waConfig(workspaceId: string): WaConfig {
  const w = get<any>("SELECT * FROM workspaces WHERE id=?", workspaceId);
  return { phoneNumberId: w?.wa_phone_number_id ?? null, wabaId: w?.wa_waba_id ?? null, token: w?.wa_token ?? null };
}

export const isMock = (c: WaConfig) => !c.token || !c.phoneNumberId;

async function graph(c: WaConfig, path: string, body?: object, method = body ? "POST" : "GET") {
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data?.error?.code;
    // 4xx other than rate limiting (4, 80007, 130429) won't succeed on retry
    const permanent = res.status < 500 && res.status !== 429 && ![4, 80007, 130429].includes(code);
    throw new WaError(data?.error?.message || `WhatsApp API ${res.status}`, permanent);
  }
  return data;
}

export const toWaNumber = (phone: string) => phone.replace(/[^\d]/g, "");

export async function sendText(c: WaConfig, to: string, text: string): Promise<string> {
  if (isMock(c)) return "mock_" + Math.random().toString(36).slice(2);
  const d = await graph(c, `${c.phoneNumberId}/messages`, {
    messaging_product: "whatsapp", to: toWaNumber(to), type: "text", text: { body: text, preview_url: true },
  });
  return d.messages?.[0]?.id;
}

export async function sendTemplate(c: WaConfig, to: string, name: string, language: string, params: string[]): Promise<string> {
  if (isMock(c)) return "mock_" + Math.random().toString(36).slice(2);
  const d = await graph(c, `${c.phoneNumberId}/messages`, {
    messaging_product: "whatsapp", to: toWaNumber(to), type: "template",
    template: {
      name, language: { code: language },
      components: params.length
        ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }]
        : [],
    },
  });
  return d.messages?.[0]?.id;
}

export async function sendInteractiveButtons(c: WaConfig, to: string, text: string, buttons: string[]): Promise<string> {
  if (isMock(c)) return "mock_" + Math.random().toString(36).slice(2);
  const d = await graph(c, `${c.phoneNumberId}/messages`, {
    messaging_product: "whatsapp", to: toWaNumber(to), type: "interactive",
    interactive: {
      type: "button", body: { text },
      action: { buttons: buttons.slice(0, 3).map((b, i) => ({ type: "reply", reply: { id: `btn_${i}`, title: b.slice(0, 20) } })) },
    },
  });
  return d.messages?.[0]?.id;
}

export async function markRead(c: WaConfig, waMessageId: string) {
  if (isMock(c)) return;
  await graph(c, `${c.phoneNumberId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: waMessageId }).catch(() => {});
}

/** Submit a template to Meta for approval. Returns Meta's template id + initial status. */
export async function submitTemplate(c: WaConfig, t: { name: string; language: string; category: string; body: string }) {
  if (!c.token || !c.wabaId) return { id: "mock_" + t.name, status: "APPROVED" };
  const d = await graph(c, `${c.wabaId}/message_templates`, {
    name: t.name, language: t.language, category: t.category,
    components: [{ type: "BODY", text: t.body, ...(/\{\{\d+\}\}/.test(t.body) ? { example: { body_text: [[...t.body.matchAll(/\{\{\d+\}\}/g)].map(() => "sample")] } } : {}) }],
  });
  return { id: d.id as string, status: (d.status as string) || "PENDING" };
}

export async function fetchTemplateStatuses(c: WaConfig): Promise<{ name: string; language: string; status: string }[]> {
  if (!c.token || !c.wabaId) return [];
  const d = await graph(c, `${c.wabaId}/message_templates?fields=name,language,status&limit=200`);
  return d.data ?? [];
}
