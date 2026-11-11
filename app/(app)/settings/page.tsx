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
      {data && <PaymentsCard data={data.payments} reload={reload} />}
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
