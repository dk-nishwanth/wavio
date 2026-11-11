import { get } from "./db";
import { metaCfg } from "./metaleads";

const dc = (region: string) => ({ accounts: `https://accounts.zoho.${region}`, api: `https://www.zohoapis.${region}` });

/** Pushes a Wavio lead into Zoho CRM as a Lead. Uses a Self Client refresh token. */
export async function pushLeadToZoho(ws: string, contactId: string) {
  const z = metaCfg(ws).zoho;
  if (!z?.refresh_token) return;
  const c = get<any>("SELECT * FROM contacts WHERE id=?", contactId);
  if (!c) return;
  const { accounts, api } = dc(z.region || "in");
  const tr = await fetch(`${accounts}/oauth/v2/token?${new URLSearchParams({ refresh_token: z.refresh_token, client_id: z.client_id, client_secret: z.client_secret, grant_type: "refresh_token" })}`, { method: "POST", signal: AbortSignal.timeout(15_000) });
  const t: any = await tr.json().catch(() => ({}));
  if (!t.access_token) throw Object.assign(new Error(`Zoho auth failed: ${t.error ?? tr.status}`), { permanent: true });
  const res = await fetch(`${api}/crm/v2/Leads`, {
    method: "POST", headers: { Authorization: `Zoho-oauthtoken ${t.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: [{ Last_Name: c.name || "WhatsApp lead", Phone: "+" + c.phone, Email: c.email || undefined, Lead_Source: "WhatsApp" }], trigger: [] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Zoho API ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
