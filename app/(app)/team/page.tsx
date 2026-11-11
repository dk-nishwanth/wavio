"use client";
import { useState } from "react";
import { api, useApi, when } from "@/components/api";

export default function Team() {
  const { data, reload } = useApi<any[]>("/api/team");
  const [f, setF] = useState({ name: "", email: "", password: "", role: "agent" });
  const [err, setErr] = useState("");
  return (
    <>
      <div className="page-head"><div><h1>Team</h1><p className="muted" style={{ margin: 0 }}>Add agents so you can assign conversations and leads. Seats depend on your plan.</p></div></div>
      <div className="card mb" style={{ maxWidth: 520 }}>
        <h2>Add a teammate</h2>
        <div className="row"><div className="grow"><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div><div className="grow"><label>Email or username</label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div></div>
        <div className="row"><div className="grow"><label>Temporary password (8+ chars)</label><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div><div><label>Role</label><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="agent">Agent</option><option value="admin">Admin</option></select></div></div>
        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
        <button className="btn mt" onClick={async () => { try { await api("/api/team", "POST", f); setF({ name: "", email: "", password: "", role: "agent" }); setErr(""); reload(); } catch (e: any) { setErr(e.message); } }}>Add user</button>
      </div>
      <div className="card" style={{ padding: 0 }}><table><thead><tr><th>Name</th><th>Login</th><th>Role</th><th>Added</th><th /></tr></thead>
        <tbody>{data?.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td><span className="pill">{u.role}</span></td><td className="muted">{when(u.created_at)}</td>
          <td><a className="small muted" style={{ cursor: "pointer", marginRight: 12 }} onClick={async () => { const pw = prompt(`New password for ${u.name} (8+ characters). They will be signed out everywhere.`); if (pw) { try { await api(`/api/team/${u.id}/password`, "POST", { password: pw }); alert("Password updated"); } catch (e: any) { setErr(e.message); } } }}>reset password</a><a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { if (confirm(`Remove ${u.name}?`)) { try { await api(`/api/team/${u.id}`, "DELETE"); reload(); } catch (e: any) { setErr(e.message); } } }}>remove</a></td></tr>)}</tbody></table></div>
    </>
  );
}
