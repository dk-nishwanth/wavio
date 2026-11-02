"use client";
import { useState } from "react";
import { api, useApi, when } from "@/components/api";

export default function Campaigns() {
  const { data, reload } = useApi<any[]>("/api/campaigns", 4000);
  const tpls = useApi<any[]>("/api/templates");
  const contacts = useApi<any[]>("/api/contacts");
  const [f, setF] = useState({ name: "", templateId: "", segmentTag: "", scheduledAt: "" }); const [msg, setMsg] = useState("");
  const approved = (tpls.data ?? []).filter((t) => t.status === "APPROVED");
  const tags = [...new Set((contacts.data ?? []).flatMap((c) => c.tags as string[]))];
  const audience = (contacts.data ?? []).filter((c) => c.opted_in && (!f.segmentTag || c.tags.includes(f.segmentTag))).length;
  return (
    <>
      <h1>Broadcasts</h1><p className="muted mb">Send an approved template to a segment. Only opted-in contacts receive it. Template variable {"{{1}}"} is filled with the contact&apos;s name.</p>
      <div className="card mb" style={{ maxWidth: 560 }}>
        <label>Campaign name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <label>Template</label><select value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}><option value="">Choose approved template…</option>{approved.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <label>Audience (tag)</label><select value={f.segmentTag} onChange={(e) => setF({ ...f, segmentTag: e.target.value })}><option value="">All opted-in contacts</option>{tags.map((t) => <option key={t}>{t}</option>)}</select>
        <label>Schedule (optional)</label><input type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} />
        <p className="muted small">Audience: {audience} contacts</p>
        {msg && <p style={{ color: "var(--danger)" }}>{msg}</p>}
        <button className="btn" disabled={!f.templateId || !audience} onClick={async () => { try { await api("/api/campaigns", "POST", f); setMsg(""); reload(); } catch (e: any) { setMsg(e.message); } }}>{f.scheduledAt ? "Schedule" : "Send now"}</button>
      </div>
      <div className="card" style={{ padding: 0 }}><table><thead><tr><th>Campaign</th><th>Template</th><th>Status</th><th>Audience</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failed</th></tr></thead>
        <tbody>{data?.map((c) => <tr key={c.id}><td>{c.name}<div className="muted small">{c.scheduled_at ? when(c.scheduled_at) : when(c.created_at)}</div></td><td>{c.template_name}</td><td><span className="pill">{c.status}</span></td><td>{c.total}</td><td>{c.sent}</td><td>{c.delivered}</td><td>{c.read}</td><td>{c.failed}</td></tr>)}</tbody></table></div>
    </>
  );
}
