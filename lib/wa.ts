import { get } from "./db";
import { decrypt } from "./crypto";
import { isProd } from "./env";

const GRAPH = "https://graph.facebook.com/v21.0";

export class WaError extends Error {
  permanent = false;
  constructor(message: string, permanent = false) { super(message); this.permanent = permanent; }
}

export type WaConfig = { phoneNumberId: string | null; wabaId: string | null; token: string | null };

export function waConfig(workspaceId: string): WaConfig {
  const w = get<any>("SELECT * FROM workspaces WHERE id=?", workspaceId);
  return { phoneNumberId: w?.wa_phone_number_id ?? null, wabaId: w?.wa_waba_id ?? null, token: decrypt(w?.wa_token) };
}

export const isMock = (c: WaConfig) => !c.token || !c.phoneNumberId;

/** Test mode fakes a send. In production an unconnected number must fail loudly instead of pretending. */
function mockSend(): string {
  if (isProd()) throw new WaError("WhatsApp is not connected — add your credentials in Settings", true);
  return "mock_" + Math.random().toString(36).slice(2);
}

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
  if (isMock(c)) return mockSend();
  const d = await graph(c, `${c.phoneNumberId}/messages`, {
    messaging_product: "whatsapp", to: toWaNumber(to), type: "text", text: { body: text, preview_url: true },
  });
  return d.messages?.[0]?.id;
}

export async function sendTemplate(c: WaConfig, to: string, name: string, language: string, params: string[]): Promise<string> {
  if (isMock(c)) return mockSend();
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
  if (isMock(c)) return mockSend();
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
  if (!c.token || !c.wabaId) { if (isProd()) throw new WaError("WhatsApp is not connected", true); return { id: "mock_" + t.name, status: "APPROVED" }; }
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

/** Sends a Meta WhatsApp Flow (an in-chat form) published in your WhatsApp Manager. */
export async function sendFlow(c: WaConfig, to: string, f: { text: string; flowId: string; cta: string; screen?: string; token: string }): Promise<string> {
  if (isMock(c)) return mockSend();
  const d = await graph(c, `${c.phoneNumberId}/messages`, {
    messaging_product: "whatsapp", to: toWaNumber(to), type: "interactive",
    interactive: {
      type: "flow", body: { text: f.text },
      action: { name: "flow", parameters: { flow_message_version: "3", flow_token: f.token, flow_id: f.flowId, flow_cta: f.cta.slice(0, 30), flow_action: "navigate", ...(f.screen ? { flow_action_payload: { screen: f.screen } } : {}) } },
    },
  });
  return d.messages?.[0]?.id;
}

/** Verifies the saved credentials against Meta and returns what Meta knows about the sending number. */
export async function checkConnection(c: WaConfig) {
  if (!c.token || !c.phoneNumberId) throw new WaError("Add the Phone number ID and access token first", true);
  const d = await graph(c, `${c.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,name_status,code_verification_status`);
  return { displayPhone: d.display_phone_number as string, verifiedName: d.verified_name as string, quality: d.quality_rating as string, nameStatus: d.name_status as string };
}

/** Uploads a file to Meta and returns the media id used when sending. */
export async function uploadMedia(c: WaConfig, bytes: Buffer, mime: string, filename: string): Promise<string> {
  if (isMock(c)) return mockSend();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  const res = await fetch(`${GRAPH}/${c.phoneNumberId}/media`, { method: "POST", headers: { Authorization: `Bearer ${c.token}` }, body: form, signal: AbortSignal.timeout(60_000) });
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new WaError(d?.error?.message || `Media upload failed (${res.status})`, res.status < 500 && res.status !== 429);
  return d.id as string;
}

export async function sendMedia(c: WaConfig, to: string, kind: "image" | "video" | "audio" | "document", mediaId: string, o: { caption?: string; filename?: string } = {}): Promise<string> {
  if (isMock(c)) return mockSend();
  const body: any = { id: mediaId };
  if (o.caption && kind !== "audio") body.caption = o.caption;
  if (kind === "document" && o.filename) body.filename = o.filename;
  const d = await graph(c, `${c.phoneNumberId}/messages`, { messaging_product: "whatsapp", to: toWaNumber(to), type: kind, [kind]: body });
  return d.messages?.[0]?.id;
}

/** Customer media: Meta gives a short-lived URL for a media id, which needs the token to download. */
export async function downloadMedia(c: WaConfig, mediaId: string): Promise<{ bytes: Buffer; mime: string }> {
  const meta = await graph(c, mediaId);
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new WaError(`Media download failed (${res.status})`, res.status < 500 && res.status !== 429);
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: meta.mime_type ?? res.headers.get("content-type") ?? "" };
}

export type ListSection = { title: string; rows: { id: string; title: string; description?: string }[] };

/** Interactive list: one button that opens a menu of up to 10 rows (e.g. room types). */
export async function sendList(c: WaConfig, to: string, f: { body: string; button: string; sections: ListSection[]; header?: string; footer?: string }): Promise<string> {
  if (isMock(c)) return mockSend();
  const d = await graph(c, `${c.phoneNumberId}/messages`, {
    messaging_product: "whatsapp", to: toWaNumber(to), type: "interactive",
    interactive: {
      type: "list", ...(f.header ? { header: { type: "text", text: f.header.slice(0, 60) } } : {}), body: { text: f.body.slice(0, 1024) }, ...(f.footer ? { footer: { text: f.footer.slice(0, 60) } } : {}),
      action: { button: f.button.slice(0, 20), sections: f.sections.map((s) => ({ title: s.title.slice(0, 24), rows: s.rows.slice(0, 10).map((r) => ({ id: r.id.slice(0, 200), title: r.title.slice(0, 24), ...(r.description ? { description: r.description.slice(0, 72) } : {}) })) })) },
    },
  });
  return d.messages?.[0]?.id;
}

export async function sendLocation(c: WaConfig, to: string, l: { latitude: number; longitude: number; name?: string; address?: string }): Promise<string> {
  if (isMock(c)) return mockSend();
  const d = await graph(c, `${c.phoneNumberId}/messages`, { messaging_product: "whatsapp", to: toWaNumber(to), type: "location", location: l });
  return d.messages?.[0]?.id;
}

/** A message with one tappable button that opens a link (booking page, payment link, brochure). */
export async function sendCtaUrl(c: WaConfig, to: string, f: { body: string; label: string; url: string; footer?: string }): Promise<string> {
  if (isMock(c)) return mockSend();
  const d = await graph(c, `${c.phoneNumberId}/messages`, {
    messaging_product: "whatsapp", to: toWaNumber(to), type: "interactive",
    interactive: { type: "cta_url", body: { text: f.body.slice(0, 1024) }, ...(f.footer ? { footer: { text: f.footer.slice(0, 60) } } : {}), action: { name: "cta_url", parameters: { display_text: f.label.slice(0, 20), url: f.url } } },
  });
  return d.messages?.[0]?.id;
}
