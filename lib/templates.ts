// WhatsApp template rules (Meta) as pure functions: validation, and the component payloads sent to Meta.

export type TButton = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone?: string };
export type TemplateInput = {
  name: string; language: string; category: string; body: string;
  header_type?: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT"; header_text?: string; footer?: string; buttons?: TButton[];
};

const vars = (s: string) => [...s.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));

/** Returns a list of human-readable problems; empty means Meta should accept the shape. */
export function validateTemplate(t: TemplateInput): string[] {
  const e: string[] = [];
  if (!/^[a-z0-9_]{1,512}$/.test(t.name)) e.push("Name can only use lowercase letters, numbers and underscores");
  if (!t.body?.trim()) e.push("Body is required");
  if ((t.body ?? "").length > 1024) e.push("Body can be at most 1024 characters");
  const bv = vars(t.body ?? "");
  const sorted = [...new Set(bv)].sort((a, b) => a - b);
  if (sorted.some((n, i) => n !== i + 1)) e.push("Variables must be numbered {{1}}, {{2}}, … without gaps");
  if (/^\s*\{\{|\{\{\d+\}\}\s*$/.test(t.body ?? "")) e.push("Body can't start or end with a variable");
  const ht = t.header_type ?? "NONE";
  if (ht === "TEXT") {
    if (!t.header_text?.trim()) e.push("Header text is required");
    if ((t.header_text ?? "").length > 60) e.push("Header text can be at most 60 characters");
    if (vars(t.header_text ?? "").length > 1) e.push("Header text can have at most one variable");
  }
  if ((t.footer ?? "").length > 60) e.push("Footer can be at most 60 characters");
  if (/\{\{/.test(t.footer ?? "")) e.push("Footer can't contain variables");
  const b = t.buttons ?? [];
  if (b.length > 10) e.push("At most 10 buttons");
  if (b.filter((x) => x.type === "URL").length > 2) e.push("At most 2 URL buttons");
  if (b.filter((x) => x.type === "PHONE_NUMBER").length > 1) e.push("At most 1 call button");
  for (const x of b) {
    if (!x.text?.trim()) e.push("Every button needs text");
    if ((x.text ?? "").length > 25) e.push(`Button "${x.text}" is longer than 25 characters`);
    if (x.type === "URL" && !/^https:\/\//.test(x.url ?? "")) e.push(`URL button "${x.text}" needs an https:// link`);
    if (x.type === "URL" && vars(x.url ?? "").length > 1) e.push("A URL button can have only one variable, at the end");
    if (x.type === "PHONE_NUMBER" && !/^\+?\d{8,15}$/.test((x.phone ?? "").replace(/[\s-]/g, ""))) e.push(`Call button "${x.text}" needs a phone number with country code`);
  }
  return e;
}

const example = (n: number) => Array.from({ length: n }, (_, i) => `Sample ${i + 1}`);

/** Components for POST /{waba}/message_templates. `headerHandle` comes from Meta's resumable upload for media headers. */
export function buildMetaComponents(t: TemplateInput, headerHandle?: string) {
  const comps: any[] = [];
  const ht = t.header_type ?? "NONE";
  if (ht === "TEXT") {
    const n = vars(t.header_text ?? "").length;
    comps.push({ type: "HEADER", format: "TEXT", text: t.header_text, ...(n ? { example: { header_text: example(1) } } : {}) });
  } else if (ht !== "NONE") {
    comps.push({ type: "HEADER", format: ht, ...(headerHandle ? { example: { header_handle: [headerHandle] } } : {}) });
  }
  const n = new Set(vars(t.body)).size;
  comps.push({ type: "BODY", text: t.body, ...(n ? { example: { body_text: [example(n)] } } : {}) });
  if (t.footer?.trim()) comps.push({ type: "FOOTER", text: t.footer });
  if (t.buttons?.length) {
    comps.push({
      type: "BUTTONS",
      buttons: t.buttons.map((b) =>
        b.type === "QUICK_REPLY" ? { type: "QUICK_REPLY", text: b.text }
        : b.type === "URL" ? { type: "URL", text: b.text, url: b.url, ...(vars(b.url ?? "").length ? { example: [`${(b.url ?? "").replace(/\{\{1\}\}/, "")}sample`] } : {}) }
        : { type: "PHONE_NUMBER", text: b.text, phone_number: (b.phone ?? "").replace(/[\s-]/g, "") }),
    });
  }
  return comps;
}

/** Components for a send: header media/text parameter, body parameters, and dynamic URL button suffixes. */
export function buildSendComponents(t: { header_type?: string | null; buttons?: TButton[] }, o: { body: string[]; headerMediaId?: string; headerText?: string; buttonParams?: string[] }) {
  const comps: any[] = [];
  const ht = t.header_type ?? "NONE";
  if (ht === "TEXT" && o.headerText) comps.push({ type: "header", parameters: [{ type: "text", text: o.headerText }] });
  if ((ht === "IMAGE" || ht === "VIDEO" || ht === "DOCUMENT") && o.headerMediaId) {
    const k = ht.toLowerCase();
    comps.push({ type: "header", parameters: [{ type: k, [k]: { id: o.headerMediaId } }] });
  }
  if (o.body.length) comps.push({ type: "body", parameters: o.body.map((p) => ({ type: "text", text: p })) });
  (t.buttons ?? []).forEach((b, i) => {
    if (b.type === "URL" && /\{\{1\}\}/.test(b.url ?? "")) comps.push({ type: "button", sub_type: "url", index: String(i), parameters: [{ type: "text", text: o.buttonParams?.[0] ?? "" }] });
  });
  return comps;
}

/** Plain-text rendering used in the inbox and previews. */
export function renderRich(t: { header_type?: string | null; header_text?: string | null; body: string; footer?: string | null; buttons?: TButton[] }, params: string[]) {
  const fill = (s: string) => s.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
  const parts: string[] = [];
  if (t.header_type === "TEXT" && t.header_text) parts.push(fill(t.header_text));
  else if (t.header_type && t.header_type !== "NONE") parts.push(`[${t.header_type.toLowerCase()}]`);
  parts.push(fill(t.body));
  if (t.footer) parts.push(t.footer);
  return parts.join("\n");
}
