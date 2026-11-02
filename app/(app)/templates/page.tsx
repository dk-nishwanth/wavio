"use client";
import { useState } from "react";
import { api, useApi } from "@/components/api";

export default function Templates() {
  const { data, reload } = useApi<any[]>("/api/templates", 5000);
  const settings = useApi<any>("/api/settings");
  const [f, setF] = useState({ name: "", category: "MARKETING", language: "en", body: "" }); const [msg, setMsg] = useState("");
  return (
    <>
      <div className="row between"><div><h1>Message templates</h1><p className="muted">Templates are required to message customers outside the 24-hour window. Meta must approve them. Use {"{{1}}"}, {"{{2}}"} for variables.</p></div>
        <button className="btn ghost" onClick={async () => { await api("/api/templates/sync", "POST"); setTimeout(reload, 2500); }}>Sync status from Meta</button></div>
      {settings.data?.mock && <div className="banner mt">Test mode: no WhatsApp credentials yet, so new templates are auto-approved locally. Add credentials in Settings to submit to Meta.</div>}
      <div className="grid mt mb">
        <div className="card" style={{ gridColumn: "span 2" }}>
          <h2>New template</h2>
          <div className="row"><div className="grow"><label>Name (lowercase_with_underscores)</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label>Category</label><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option>MARKETING</option><option>UTILITY</option><option>AUTHENTICATION</option></select></div>
            <div><label>Language</label><input style={{ width: 70 }} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} /></div></div>
          <label>Body</label><textarea rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Hi {{1}}, your order {{2}} is confirmed! 🎉" />
          {msg && <p style={{ color: "var(--danger)" }}>{msg}</p>}
          <button className="btn mt" onClick={async () => { try { const r = await api("/api/templates", "POST", f); setMsg(r.warning ?? ""); setF({ ...f, name: "", body: "" }); reload(); } catch (e: any) { setMsg(e.message); } }}>Create &amp; submit</button>
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}><table><thead><tr><th>Name</th><th>Category</th><th>Body</th><th>Status</th></tr></thead>
        <tbody>{data?.map((t) => <tr key={t.id}><td><code>{t.name}</code> <span className="muted small">{t.language}</span></td><td>{t.category}</td><td style={{ whiteSpace: "pre-wrap" }}>{t.body}</td>
          <td><span className={"pill " + (t.status === "APPROVED" ? "ok" : t.status === "REJECTED" ? "bad" : "")}>{t.status}</span></td></tr>)}</tbody></table></div>
    </>
  );
}
