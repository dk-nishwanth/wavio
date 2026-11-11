"use client";
import { useState } from "react";
import { api, useApi } from "@/components/api";

export default function Settings() {
  const { data, reload } = useApi<any>("/api/settings");
  const stats = useApi<any>("/api/stats", 5000);
  const [f, setF] = useState({ phoneNumberId: "", wabaId: "", token: "", appSecret: "" }); const [msg, setMsg] = useState("");
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const s = stats.data;
  return (
    <>
      <h1>Settings</h1>
      {s && <div className="grid mb">{[["Contacts", s.contacts], ["Opted in", s.optedIn], ["Open chats", s.openConversations], ["Unread", s.unread], ["Sent (7d)", s.sent7d], ["Received (7d)", s.received7d], ["Failed (7d)", s.failed7d], ["Queued jobs", s.pendingJobs]].map(([k, v]) => <div className="card stat" key={k as string}><span className="muted small">{k}</span><b>{v}</b></div>)}</div>}
      {data?.mock && <div className="banner">Test mode — no WhatsApp credentials saved. Messages are simulated locally (nothing is sent to WhatsApp). Add your Meta credentials below to go live.</div>}
      <div className="card" style={{ maxWidth: 620 }}>
        <h2>WhatsApp Cloud API</h2>
        <label>Phone number ID</label><input value={f.phoneNumberId} onChange={set("phoneNumberId")} placeholder={data?.phoneNumberId ?? ""} />
        <label>WhatsApp Business Account ID</label><input value={f.wabaId} onChange={set("wabaId")} placeholder={data?.wabaId ?? ""} />
        <label>Permanent access token {data?.hasToken && <span className="pill ok">saved</span>}</label><input type="password" value={f.token} onChange={set("token")} placeholder={data?.hasToken ? "•••••• (leave blank to keep)" : ""} />
        <label>Meta app secret (verifies webhook signatures) {data?.hasAppSecret && <span className="pill ok">saved</span>}</label><input type="password" value={f.appSecret} onChange={set("appSecret")} />
        <button className="btn mt" onClick={async () => { await api("/api/settings", "PUT", f); setF({ phoneNumberId: "", wabaId: "", token: "", appSecret: "" }); setMsg("Saved"); reload(); }}>Save</button> <span className="muted">{msg}</span>
      </div>
      <AccountCard />
      {data && <BusinessCard data={data} reload={reload} />}
      {data && <PaymentsCard data={data.payments} reload={reload} />}
      {data && <MetaCard data={data.meta} reload={reload} devTools={data.devTools} />}
      {data && <IntegrationsCard data={data.integrations} reload={reload} />}
      {data && <TestCard disabled={data.mock} />}
      {data && <div className="card mt" style={{ maxWidth: 620 }}>
        <h2>Webhook (paste into Meta → WhatsApp → Configuration)</h2>
        <label>Callback URL (must be public HTTPS — use a tunnel like ngrok while developing)</label><input readOnly value={data.webhookUrl} onFocus={(e) => e.target.select()} />
        <label>Verify token</label><input readOnly value={data.verifyToken} onFocus={(e) => e.target.select()} />
        <p className="small muted">Subscribe to the <code>messages</code> field.</p>
      </div>}
    </>
  );
}

function PaymentsCard({ data, reload }: { data: any; reload: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async (extra: Record<string, string> = {}) => { await api("/api/settings", "PUT", { payments: { ...f, ...extra } }); setF({}); setMsg("Saved"); reload(); };
  return (
    <div className="card mt" style={{ maxWidth: 620 }}>
      <div className="row between"><h2>Payments</h2><span className={"pill " + (data.provider === "test" ? "warn" : "ok")}>{data.provider === "test" ? "Test checkout (no gateway)" : data.provider + " active"}</span></div>
      <p className="muted small">Payment links in chat use Razorpay if its keys are saved, otherwise PayU, otherwise a built-in test checkout.</p>
      <h2 style={{ marginTop: 14 }}>Razorpay</h2>
      <label>Key ID</label><input value={f.razorpay_key_id ?? ""} onChange={set("razorpay_key_id")} placeholder={data.razorpayKeyId} />
      <label>Key secret {data.hasRazorpaySecret && <span className="pill ok">saved</span>}</label><input type="password" value={f.razorpay_key_secret ?? ""} onChange={set("razorpay_key_secret")} />
      <label>Webhook secret {data.hasRazorpayWebhook && <span className="pill ok">saved</span>}</label><input type="password" value={f.razorpay_webhook_secret ?? ""} onChange={set("razorpay_webhook_secret")} />
      <label>Webhook URL (event: payment_link.paid)</label><input readOnly value={data.razorpayWebhookUrl} onFocus={(e) => e.target.select()} />
      <h2 style={{ marginTop: 14 }}>PayU</h2>
      <label>Merchant key</label><input value={f.payu_key ?? ""} onChange={set("payu_key")} placeholder={data.payuKey} />
      <label>Salt {data.hasPayuSalt && <span className="pill ok">saved</span>}</label><input type="password" value={f.payu_salt ?? ""} onChange={set("payu_salt")} />
      <label>Mode</label><select value={f.payu_mode ?? data.payuMode} onChange={set("payu_mode")}><option value="test">Test</option><option value="live">Live</option></select>
      <div className="row mt"><button className="btn" onClick={() => save()}>Save payment settings</button><span className="muted">{msg}</span></div>
    </div>
  );
}

function MetaCard({ data, reload, devTools }: { data: any; reload: () => void; devTools: boolean }) {
  const [token, setToken] = useState(""); const [t, setT] = useState({ name: "", phone: "" }); const [msg, setMsg] = useState("");
  return (
    <div className="card mt" style={{ maxWidth: 620 }}>
      <h2>Ads &amp; lead forms</h2>
      <p className="muted small">Click-to-WhatsApp ads need nothing extra: chats that start from an ad are tagged <code>ctwa</code> automatically. For Facebook/Instagram Lead Forms, add the webhook below to your Meta app (Page → field <code>leadgen</code>) and save a Page access token.</p>
      <label>Leads webhook URL (verify token is the same as WhatsApp)</label><input readOnly value={data.leadsWebhookUrl} onFocus={(e) => e.target.select()} />
      <label>Page access token {data.hasPageToken && <span className="pill ok">saved</span>}</label>
      <div className="row"><input type="password" value={token} onChange={(e) => setToken(e.target.value)} /><button className="btn" onClick={async () => { await api("/api/settings", "PUT", { metaPageToken: token }); setToken(""); reload(); }}>Save</button></div>
      {devTools && <><h2 style={{ marginTop: 16 }}>Try it without an ad</h2>
      <div className="row"><input placeholder="Name" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /><input placeholder="Phone" value={t.phone} onChange={(e) => setT({ ...t, phone: e.target.value })} />
        <button className="btn ghost" onClick={async () => { try { await api("/api/dev/lead", "POST", t); setMsg("Lead created — see Leads"); } catch (e: any) { setMsg(e.message); } }}>Simulate lead form</button></div>
      <p className="muted small">{msg}</p></>}
    </div>
  );
}

function IntegrationsCard({ data, reload }: { data: any; reload: () => void }) {
  const [cal, setCal] = useState(""); const [z, setZ] = useState({ client_id: "", client_secret: "", refresh_token: "", region: data.zohoRegion });
  return (
    <div className="card mt" style={{ maxWidth: 620 }}>
      <h2>Integrations</h2>
      <h2 style={{ marginTop: 10 }}>Cal.com</h2>
      <p className="muted small">In Cal.com → Settings → Developer → Webhooks, add this URL with a secret, for booking created / rescheduled / cancelled. Bookings become events (<code>booking_created</code>…) that automations can listen to, e.g. a reminder 1 day before.</p>
      <label>Webhook URL</label><input readOnly value={data.calUrl} onFocus={(e) => e.target.select()} />
      <label>Webhook secret {data.hasCalSecret && <span className="pill ok">saved</span>}</label>
      <div className="row"><input type="password" value={cal} onChange={(e) => setCal(e.target.value)} /><button className="btn" onClick={async () => { await api("/api/settings", "PUT", { calcomSecret: cal }); setCal(""); reload(); }}>Save</button></div>
      <h2 style={{ marginTop: 16 }}>Zoho CRM {data.zohoConnected && <span className="pill ok">connected</span>}</h2>
      <p className="muted small">New leads are pushed to Zoho CRM as Leads. Create a Self Client in the Zoho API Console (scope <code>ZohoCRM.modules.leads.CREATE</code>) and paste its credentials and refresh token.</p>
      <div className="row"><input placeholder="Client ID" value={z.client_id} onChange={(e) => setZ({ ...z, client_id: e.target.value })} /><input type="password" placeholder="Client secret" value={z.client_secret} onChange={(e) => setZ({ ...z, client_secret: e.target.value })} /></div>
      <div className="row mt"><input type="password" placeholder="Refresh token" value={z.refresh_token} onChange={(e) => setZ({ ...z, refresh_token: e.target.value })} />
        <select style={{ width: 90 }} value={z.region} onChange={(e) => setZ({ ...z, region: e.target.value })}><option value="in">.in</option><option value="com">.com</option><option value="eu">.eu</option><option value="com.au">.com.au</option></select></div>
      <div className="row mt"><button className="btn" disabled={!z.client_id || !z.client_secret || !z.refresh_token} onClick={async () => { await api("/api/settings", "PUT", { zoho: z }); setZ({ ...z, client_id: "", client_secret: "", refresh_token: "" }); reload(); }}>Connect Zoho</button>
        {data.zohoConnected && <button className="btn ghost" onClick={async () => { await api("/api/settings", "PUT", { disconnectZoho: true }); reload(); }}>Disconnect</button>}</div>
      <h2 style={{ marginTop: 16 }}>Gmail &amp; Zoom</h2>
      <p className="muted small">Both work through the Events API in Developers: a Google Apps Script (Gmail) or a Zoom webhook relay posts <code>{"{ event, phone, properties }"}</code> to <code>/api/v1/events</code> with your secret key. Example snippets are on the Developers page.</p>
    </div>
  );
}

function BusinessCard({ data, reload }: { data: any; reload: () => void }) {
  const [f, setF] = useState({ industry: data.industry, name: data.business?.name ?? "", location: data.business?.location ?? "", check_in_time: data.business?.check_in_time ?? "12:00 PM", check_out_time: data.business?.check_out_time ?? "11:00 AM" });
  const [msg, setMsg] = useState("");
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card mt" style={{ maxWidth: 620 }}>
      <h2>Business profile</h2>
      <p className="muted small">Sets the pipeline wording (e.g. Enquiry → Booked for resorts) and fills your message templates.</p>
      <div className="row"><div className="grow"><label>Business type</label><select value={f.industry} onChange={set("industry")}><option value="general">General</option><option value="resort">Resort / hospitality</option></select></div>
        <div className="grow"><label>Business name</label><input value={f.name} onChange={set("name")} placeholder="Jawai Retreat" /></div></div>
      <div className="row"><div className="grow"><label>Location</label><input value={f.location} onChange={set("location")} /></div><div style={{ width: 130 }}><label>Check-in</label><input value={f.check_in_time} onChange={set("check_in_time")} /></div><div style={{ width: 130 }}><label>Check-out</label><input value={f.check_out_time} onChange={set("check_out_time")} /></div></div>
      <div className="row mt"><button className="btn" onClick={async () => { await api("/api/settings", "PUT", { industry: f.industry, business: { name: f.name, location: f.location, check_in_time: f.check_in_time, check_out_time: f.check_out_time } }); setMsg("Saved — reload to update menu labels"); reload(); }}>Save</button><span className="muted small">{msg}</span></div>
    </div>
  );
}

function TestCard({ disabled }: { disabled: boolean }) {
  const [to, setTo] = useState(""); const [r, setR] = useState<any>(null); const [busy, setBusy] = useState(false);
  const run = async (send: boolean) => { setBusy(true); try { setR(await api("/api/settings/test", "POST", send ? { to } : {})); } catch (e: any) { setR({ ok: false, error: e.message }); } setBusy(false); };
  return (
    <div className="card mt" style={{ maxWidth: 620 }}>
      <h2>Test your WhatsApp connection</h2>
      {disabled && <p className="muted small">Save your Phone number ID and access token above first.</p>}
      <div className="row"><button className="btn" disabled={disabled || busy} onClick={() => run(false)}>Check connection</button></div>
      <label>Send Meta&apos;s test message (hello_world) to a verified recipient number</label>
      <div className="row"><input placeholder="919876543210 (with country code)" value={to} onChange={(e) => setTo(e.target.value)} /><button className="btn ghost" disabled={disabled || busy || !to} onClick={() => run(true)}>Send test</button></div>
      {r && (<div className={"banner mt " + (r.ok ? "ok" : "")}>
        {r.ok ? "Connected ✓" : r.error}
        {r.connection && <div className="small">Number {r.connection.displayPhone} · name “{r.connection.verifiedName}” ({r.connection.nameStatus}) · quality {r.connection.quality}</div>}
        {r.messageId && <div className="small">Test message sent. If it doesn&apos;t arrive, the number isn&apos;t on your recipient list yet.</div>}
        <div className="small">Webhook: {r.webhookLastSeen ? "last event received " + new Date(r.webhookLastSeen).toLocaleString() : "no events received yet — finish the webhook step"}</div>
      </div>)}
    </div>
  );
}

function AccountCard() {
  const [f, setF] = useState({ current: "", next: "" }); const [msg, setMsg] = useState("");
  return (
    <div className="card mt" style={{ maxWidth: 620 }}>
      <h2>Your account</h2>
      <div className="row"><div className="grow"><label>Current password</label><input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></div>
        <div className="grow"><label>New password (8+ characters)</label><input type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></div></div>
      <div className="row mt"><button className="btn" disabled={!f.current || f.next.length < 8} onClick={async () => { try { await api("/api/auth/password", "POST", f); setF({ current: "", next: "" }); setMsg("Password changed. Other devices were signed out."); } catch (e: any) { setMsg(e.message); } }}>Change password</button><span className="muted small">{msg}</span></div>
    </div>
  );
}
