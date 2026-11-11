"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApi, when } from "@/components/api";

const TEMP: Record<string, { label: string; cls: string; color: string }> = {
  hot: { label: "Hot", cls: "bad", color: "#ef4444" },
  warm: { label: "Warm", cls: "warn", color: "#f59e0b" },
  new: { label: "New", cls: "info", color: "#3b82f6" },
};
const money = (n: number) => (n ? "₹" + n.toLocaleString("en-IN") : "—");

export default function Leads() {
  const { data, reload } = useApi<any>("/api/leads", 5000);
  const [temp, setTemp] = useState<string>("all");
  const [open, setOpen] = useState<any>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const leads: any[] = (data?.leads ?? []).filter((l: any) => temp === "all" || l.temperature === temp);
  const counts = (t: string) => (data?.leads ?? []).filter((l: any) => l.temperature === t).length;
  const pipeline = (data?.leads ?? []).filter((l: any) => !["won", "lost"].includes(l.stage)).reduce((a: number, l: any) => a + l.value, 0);
  const won = (data?.leads ?? []).filter((l: any) => l.stage === "won").reduce((a: number, l: any) => a + l.value, 0);

  async function move(id: string, stage: string) { await api(`/api/leads/${id}`, "PATCH", { stage }); reload(); }

  return (
    <>
      <div className="page-head">
        <div><h1>Leads</h1><p className="muted" style={{ margin: 0 }}>Every chat and website visitor becomes a lead. Scores update automatically from replies, orders and engagement.</p></div>
      </div>
      <div className="grid mb">
        {Object.entries(TEMP).map(([k, t]) => (
          <div key={k} className="card" style={{ cursor: "pointer", outline: temp === k ? "2px solid var(--brand)" : "none" }} onClick={() => setTemp(temp === k ? "all" : k)}>
            <div className="row"><span style={{ width: 9, height: 9, borderRadius: 9, background: t.color }} /><span className="muted small">{t.label} leads</span></div>
            <b style={{ fontSize: 28, fontWeight: 600 }}>{counts(k)}</b>
          </div>
        ))}
        <div className="card"><span className="muted small">Open pipeline</span><div style={{ fontSize: 28, fontWeight: 600 }}>{money(pipeline)}</div></div>
        <div className="card"><span className="muted small">Won</span><div style={{ fontSize: 28, fontWeight: 600 }}>{money(won)}</div></div>
      </div>

      <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(230px,1fr)", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
        {data?.stages.map((st: any) => {
          const col = leads.filter((l) => l.stage === st.key);
          return (
            <div key={st.key} className="card soft" style={{ padding: 10, minHeight: 300, outline: drag === st.key ? "2px dashed var(--brand)" : "none" }}
              onDragOver={(e) => { e.preventDefault(); setDrag(st.key); }} onDragLeave={() => setDrag(null)}
              onDrop={(e) => { e.preventDefault(); setDrag(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, st.key); }}>
              <div className="row between" style={{ padding: "2px 4px 10px" }}><b style={{ fontWeight: 600 }}>{st.label}</b><span className="chip">{col.length}</span></div>
              <div style={{ display: "grid", gap: 8 }}>
                {col.map((l) => (
                  <div key={l.id} className="card" draggable style={{ padding: 12, cursor: "grab" }} onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)} onClick={async () => { const d = await api(`/api/leads/${l.id}`); setOpen({ ...l, ...d }); }}>
                    <div className="row between"><b style={{ fontWeight: 500 }}>{l.name || "+" + l.phone}</b><span className={"pill " + TEMP[l.temperature].cls} style={{ margin: 0 }}>{TEMP[l.temperature].label} · {l.score}</span></div>
                    <div className="muted small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: "4px 0" }}>{l.last_preview || l.source}</div>
                    <div className="row between small"><span className="muted">{money(l.value)}</span>{l.follow_up_at && <span className={l.follow_up_at < Date.now() ? "pill bad" : "pill"} style={{ margin: 0 }}>Follow up {when(l.follow_up_at)}</span>}</div>
                  </div>
                ))}
                {col.length === 0 && <p className="muted small" style={{ padding: 6, margin: 0 }}>Drop leads here</p>}
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 20, display: "flex", justifyContent: "flex-end" }} onClick={() => setOpen(null)}>
          <div className="card" style={{ width: 420, height: "100%", borderRadius: 0, overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="row between"><h1 style={{ fontSize: 20 }}>{open.name || "+" + open.phone}</h1><a className="muted" style={{ cursor: "pointer" }} onClick={() => setOpen(null)}>✕</a></div>
            <p className="muted small" style={{ margin: 0 }}>+{open.phone} {open.email && `· ${open.email}`} · source: {open.source}</p>
            <div className="row mt wrap"><span className={"pill " + TEMP[open.temperature].cls}>{TEMP[open.temperature].label} · score {open.score}</span>{open.tags.map((t: string) => <span key={t} className="pill">{t}</span>)}</div>
            <label>Stage</label>
            <select value={open.stage} onChange={async (e) => { await move(open.id, e.target.value); setOpen({ ...open, stage: e.target.value }); }}>{data.stages.map((s: any) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
            <label>Deal value (₹)</label>
            <input type="number" defaultValue={open.value || ""} onBlur={async (e) => { await api(`/api/leads/${open.id}`, "PATCH", { value: e.target.value }); reload(); }} />
            <label>Owner</label>
            <select defaultValue={open.owner_id ?? ""} onChange={async (e) => { await api(`/api/leads/${open.id}`, "PATCH", { owner_id: e.target.value }); reload(); }}><option value="">Unassigned</option>{open.agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <label>Follow-up</label>
            <input type="datetime-local" defaultValue={open.follow_up_at ? new Date(open.follow_up_at - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : ""} onBlur={async (e) => { await api(`/api/leads/${open.id}`, "PATCH", { follow_up_at: e.target.value || null }); reload(); }} />
            <label>Notes</label>
            <textarea rows={3} defaultValue={open.notes ?? ""} onBlur={async (e) => { await api(`/api/leads/${open.id}`, "PATCH", { notes: e.target.value }); }} />
            <div className="row mt"><Link className="btn" href="/inbox">Open inbox</Link></div>
            <h2 className="mt">Activity</h2>
            <input placeholder="Log a note + Enter" onKeyDown={async (e) => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === "Enter" && v) { await api(`/api/leads/${open.id}`, "PATCH", { activity: v }); (e.target as HTMLInputElement).value = ""; const d = await api(`/api/leads/${open.id}`); setOpen({ ...open, ...d }); } }} />
            {open.activity.map((a: any) => <div key={a.id} className="check"><div><div className="small">{a.text}</div><div className="muted small">{when(a.created_at)}</div></div></div>)}
          </div>
        </div>
      )}
    </>
  );
}
