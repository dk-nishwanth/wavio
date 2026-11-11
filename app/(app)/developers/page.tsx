"use client";
import { useState } from "react";
import { api, useApi } from "@/components/api";

export default function Developers() {
  const keys = useApi<any[]>("/api/keys");
  const hooks = useApi<any[]>("/api/webhooks");
  const [newKey, setNewKey] = useState(""); const [origins, setOrigins] = useState(""); const [url, setUrl] = useState("");
  const base = typeof location !== "undefined" ? location.origin : "";
  return (
    <>
      <h1>Developers</h1><p className="muted mb">Connect your React website. Use the <b>public key</b> in the browser and the <b>secret key</b> only on your server.</p>
      {newKey && <div className="banner">Copy your new key now — it won&apos;t be shown again: <code>{newKey}</code></div>}
      <div className="card mb" style={{ padding: 0 }}><table><thead><tr><th>Key</th><th>Type</th><th>Allowed origins (public keys)</th><th /></tr></thead>
        <tbody>{keys.data?.map((k) => <tr key={k.id}><td><code>{k.key_prefix}…</code> <span className="muted small">{k.label}</span></td><td><span className="pill">{k.kind}</span></td>
          <td>{k.kind === "public" ? <input defaultValue={k.allowed_origins.join(", ")} placeholder="https://yoursite.com (empty = any)" onBlur={async (e) => { await api("/api/keys", "PATCH", { id: k.id, origins: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }); }} /> : <span className="muted small">server-side only</span>}</td>
          <td><a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { if (confirm("Revoke this key?")) { await api("/api/keys", "DELETE", { id: k.id }); keys.reload(); } }}>revoke</a></td></tr>)}</tbody></table></div>
      <div className="row mb"><button className="btn ghost" onClick={async () => { const r = await api("/api/keys", "POST", { kind: "public", label: "Website", origins: origins.split(",").map((s) => s.trim()).filter(Boolean) }); setNewKey(r.key); keys.reload(); }}>+ Public key</button>
        <button className="btn ghost" onClick={async () => { const r = await api("/api/keys", "POST", { kind: "secret", label: "Server" }); setNewKey(r.key); keys.reload(); }}>+ Secret key</button>
        <input style={{ maxWidth: 320 }} placeholder="Origins for new public key (comma-separated)" value={origins} onChange={(e) => setOrigins(e.target.value)} /></div>

      <h2>Outbound webhooks</h2><p className="muted small">Events: message.received, message.sent, message.delivered, message.read, message.failed. Requests are signed: <code>X-Signature: sha256=HMAC(secret, body)</code>.</p>
      <div className="card mb" style={{ padding: 0 }}><table><tbody>{hooks.data?.map((h) => <tr key={h.id}><td>{h.url}</td><td className="small muted">secret: <code>{h.secret}</code></td><td><a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { await api("/api/webhooks", "DELETE", { id: h.id }); hooks.reload(); }}>delete</a></td></tr>)}</tbody></table></div>
      <div className="row mb"><input placeholder="https://your-site.com/api/whatsapp-events" value={url} onChange={(e) => setUrl(e.target.value)} /><button className="btn" onClick={async () => { await api("/api/webhooks", "POST", { url }); setUrl(""); hooks.reload(); }}>Add</button></div>

      <h2>React quick start</h2>
      <pre>{`import { WAConnectProvider, WhatsAppOptIn, useWAConnect } from "./sdk";   // copy /sdk/index.tsx into your project

<WAConnectProvider publicKey="pk_live_..." baseUrl="${base}">
  <WhatsAppOptIn />            {/* collects phone + consent */}
</WAConnectProvider>

const { track, trackCart } = useWAConnect();
trackCart({ cart_url, total });                          // abandoned-cart automation listens for this
track("order_placed", { order_id: "1042", total: 1499 }); // order confirmation automation + cancels abandoned cart`}</pre>
      <h2 className="mt">Server-side (your backend)</h2>
      <pre>{`# identify / track
curl -X POST ${base}/api/v1/events -H "Authorization: Bearer sk_live_..." -H "Content-Type: application/json" \\
  -d '{"event":"order_placed","phone":"919876543210","properties":{"order_id":"1042"},"idempotencyKey":"order-1042"}'

# send an approved template directly (secret key only)
curl -X POST ${base}/api/v1/messages/template -H "Authorization: Bearer sk_live_..." -H "Content-Type: application/json" \\
  -d '{"phone":"919876543210","template":"order_shipped","params":["Asha","#1042"],"optIn":true}'`}</pre>
      <h2 className="mt">Gmail (Google Apps Script)</h2>
      <pre>{`function onNewLead(e) {            // run from a Form-submit or time-driven trigger
  UrlFetchApp.fetch("${base}/api/v1/events", {
    method: "post", contentType: "application/json",
    headers: { Authorization: "Bearer sk_live_..." },
    payload: JSON.stringify({ event: "email_lead", phone: "919876543210", name: "Asha", optIn: true,
                              properties: { subject: "Pricing question" } })
  });
}`}</pre>
      <h2 className="mt">Zoom</h2>
      <p className="muted small">Point a Zoom webhook (e.g. meeting.ended, webinar.registration_created) at a small function on your server that calls <code>POST /api/v1/events</code> with the secret key, event <code>zoom_meeting_ended</code> and the attendee&apos;s phone. Automations can then send a follow-up.</p>
      <p className="muted small">Try it live: <a href="/demo" style={{ textDecoration: "underline" }}>/demo</a>.</p>
    </>
  );
}
