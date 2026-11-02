"use client";
import { useState } from "react";
import { api, useApi, when } from "@/components/api";

export default function Contacts() {
  const { data, reload } = useApi<any[]>("/api/contacts");
  const [q, setQ] = useState("");
  const [add, setAdd] = useState({ phone: "", name: "", email: "", tag: "", optedIn: false });
  const [csv, setCsv] = useState(""); const [consent, setConsent] = useState(false); const [tag, setTag] = useState(""); const [msg, setMsg] = useState("");
  const rows = (data ?? []).filter((c) => `${c.name ?? ""} ${c.phone} ${c.email ?? ""} ${c.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h1>Contacts</h1><p className="muted mb">{data?.length ?? 0} contacts. Messages go only to contacts who have opted in.</p>
      <div className="grid mb">
        <div className="card">
          <h2>Add contact</h2>
          <input placeholder="Phone (with country code)" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} />
          <label>Name</label><input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
          <label>Tag</label><input value={add.tag} onChange={(e) => setAdd({ ...add, tag: e.target.value })} />
          <label className="row"><input type="checkbox" style={{ width: "auto" }} checked={add.optedIn} onChange={(e) => setAdd({ ...add, optedIn: e.target.checked })} /> Contact has opted in to WhatsApp</label>
          <button className="btn mt" onClick={async () => { try { await api("/api/contacts", "POST", { ...add, tags: add.tag ? [add.tag] : [] }); setAdd({ phone: "", name: "", email: "", tag: "", optedIn: false }); setMsg(""); reload(); } catch (e: any) { setMsg(e.message); } }}>Add</button>
        </div>
        <div className="card" style={{ gridColumn: "span 2" }}>
          <h2>Import CSV</h2>
          <textarea rows={4} placeholder={"phone,name,email\n919876543210,Asha,asha@example.com"} value={csv} onChange={(e) => setCsv(e.target.value)} />
          <div className="row mt"><input style={{ width: 160 }} placeholder="Tag (optional)" value={tag} onChange={(e) => setTag(e.target.value)} />
            <label className="row grow" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I confirm these contacts opted in</label>
            <button className="btn" onClick={async () => { try { const r = await api("/api/contacts/import", "POST", { csv, consent, tag }); setMsg(`Imported ${r.imported}. ${r.errors.join("; ")}`); setCsv(""); reload(); } catch (e: any) { setMsg(e.message); } }}>Import</button></div>
        </div>
      </div>
      {msg && <div className="banner">{msg}</div>}
      <input placeholder="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} className="mb" />
      <div className="card" style={{ padding: 0 }}>
        <table><thead><tr><th>Name</th><th>Phone</th><th>Tags</th><th>Opt-in</th><th>Added</th><th /></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id}><td>{c.name || "—"}</td><td>+{c.phone}</td><td>{c.tags.map((t: string) => <span className="pill" key={t}>{t}</span>)}</td>
              <td><span className={"pill " + (c.opted_in ? "ok" : "bad")} style={{ cursor: "pointer" }} onClick={async () => { await api(`/api/contacts/${c.id}`, "PATCH", { optedIn: !c.opted_in }); reload(); }}>{c.opted_in ? "opted in" : "opted out"}</span></td>
              <td className="muted">{when(c.created_at)}</td>
              <td><a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { if (confirm("Delete contact and conversation?")) { await api(`/api/contacts/${c.id}`, "DELETE"); reload(); } }}>delete</a></td></tr>))}</tbody></table>
      </div>
    </>
  );
}
