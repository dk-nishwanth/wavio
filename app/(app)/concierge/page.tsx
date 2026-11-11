"use client";
import { useRef, useState } from "react";
import { api, useApi, when } from "@/components/api";

const ACTION_LABEL: Record<string, string> = {
  send_file: "Send photos & brochures", send_location: "Send location", send_menu: "Show option lists", quick_replies: "Ask with buttons", save_details: "Save guest details",
  create_request: "Raise requests for the team", my_bookings: "Look up the guest's bookings", send_payment_link: "Re-send payment links", add_tag: "Tag guests", set_stage: "Move pipeline stage", handoff_to_human: "Hand over to a person",
};
const KIND_LABEL: Record<string, string> = { service: "Service requests (pickup, extra bed…)", callback: "Callback requests", other: "Other" };

export default function Concierge() {
  const [tab, setTab] = useState<"behaviour" | "knowledge" | "library" | "playground">("behaviour");
  return (
    <>
      <div className="page-head"><div><h1>AI Concierge</h1><p className="muted" style={{ margin: 0 }}>Guests chat on WhatsApp; the concierge answers from your knowledge, shares photos and location, takes requests, and hands anything it can&apos;t do to your team.</p></div></div>
      <div className="row mb">{(["behaviour", "knowledge", "library", "playground"] as const).map((t) => <span key={t} className="chip" style={{ cursor: "pointer", textTransform: "capitalize", background: tab === t ? "var(--brand)" : "", color: tab === t ? "var(--on-brand)" : "" }} onClick={() => setTab(t)}>{t}</span>)}</div>
      {tab === "behaviour" && <Behaviour />}{tab === "knowledge" && <Knowledge />}{tab === "library" && <Library />}{tab === "playground" && <Playground />}
    </>
  );
}

function Behaviour() {
  const { data, reload } = useApi<any>("/api/ai/agent");
  const [f, setF] = useState<any>(null); const [key, setKey] = useState(""); const [msg, setMsg] = useState("");
  if (!data) return null;
  const a = f ?? { ...data.agent, autoApprove: data.autoApprove };
  const set = (patch: object) => setF({ ...a, ...patch });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = async (extra: object = {}) => { try { await api("/api/ai/agent", "PUT", { ...a, autoApprove: a.autoApprove, ...extra }); setF(null); setKey(""); setMsg("Saved"); reload(); } catch (e: any) { setMsg(e.message); } };
  return (
    <div style={{ maxWidth: 720 }}>
      {!data.configured && <div className="banner">The concierge needs an Anthropic API key. Paste one below (or set <code>ANTHROPIC_API_KEY</code> on the server).</div>}
      <div className="card mb">
        <div className="row between"><h2>Switch on</h2><span className={"pill " + (a.enabled && a.auto_reply ? "ok" : "warn")}>{a.enabled && a.auto_reply ? "Answering guests" : "Off"}</span></div>
        <label className="row"><input type="checkbox" checked={!!a.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Concierge enabled</label>
        <label className="row"><input type="checkbox" checked={!!a.auto_reply} onChange={(e) => set({ auto_reply: e.target.checked })} /> Reply automatically to guest messages that no chatbot flow handles</label>
        <p className="muted small">It stops by itself when a team member replies in a chat or it hands the chat over. Use &quot;Resume bot&quot; in the inbox to let it continue.</p>
        <label>Anthropic API key {data.keySource && <span className="pill ok">{data.keySource === "workspace" ? "saved" : "from server"}</span>}</label>
        <div className="row"><input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" /><button className="btn ghost" disabled={!key} onClick={() => save({ aiKey: key })}>Save key</button></div>
      </div>
      <div className="card mb">
        <h2>Personality &amp; instructions</h2>
        <div className="row"><div className="grow"><label>Name</label><input value={a.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="grow"><label>Mode</label><select value={a.mode} onChange={(e) => set({ mode: e.target.value })}><option value="support">Support — help and resolve</option><option value="sales">Sales — guide guests toward booking</option><option value="qa">Q&amp;A — answer questions only</option></select></div></div>
        <label>Instructions (tone, what to emphasise, what to avoid)</label>
        <textarea rows={6} value={a.instructions} onChange={(e) => set({ instructions: e.target.value })} />
        <div className="row"><div className="grow"><label>Model (optional)</label><input value={a.model ?? ""} onChange={(e) => set({ model: e.target.value })} placeholder={data.defaultModel} /></div>
          <div style={{ width: 140 }}><label>Creativity (0–1)</label><input type="number" step="0.1" min={0} max={1} value={a.temperature} onChange={(e) => set({ temperature: Number(e.target.value) })} /></div>
          <div style={{ width: 200 }}><label>Max replies per month</label><input type="number" min={1} value={a.monthly_credit_limit ?? ""} onChange={(e) => set({ monthly_credit_limit: e.target.value })} placeholder="no limit" /></div></div>
        <p className="muted small">{data.repliesThisMonth} replies this month · last 30 days: {data.usage30d.replies} replies, {data.usage30d.escalated} handed to your team.</p>
      </div>
      <div className="card mb">
        <h2>What it may do</h2>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>{data.allActions.map((x: string) => <label key={x} className="row small" style={{ margin: 0 }}><input type="checkbox" checked={a.actions.includes(x)} onChange={() => set({ actions: toggle(a.actions, x) })} /> {ACTION_LABEL[x]}</label>)}</div>
        <h2 style={{ marginTop: 16 }}>Approve automatically</h2>
        <p className="muted small">Bookings, cancellations and changes always wait for you. These smaller requests can be approved without asking:</p>
        {data.autoApprovable.map((k: string) => <label key={k} className="row small" style={{ margin: 0 }}><input type="checkbox" checked={a.autoApprove.includes(k)} onChange={() => set({ autoApprove: toggle(a.autoApprove, k) })} /> {KIND_LABEL[k]}</label>)}
      </div>
      <div className="row"><button className="btn" onClick={() => save()}>Save changes</button><span className="muted small">{msg}</span></div>
    </div>
  );
}

function Knowledge() {
  const { data, reload } = useApi<any[]>("/api/kb");
  const [text, setText] = useState({ title: "", text: "" }); const [url, setUrl] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [q, setQ] = useState(""); const [hits, setHits] = useState<any[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(""); try { await fn(); setMsg(ok); reload(); } catch (e: any) { setMsg(e.message); } setBusy(false); };
  return (
    <div style={{ maxWidth: 760 }}>
      <p className="muted">Everything the concierge knows about your business comes from here: rooms, rates, packages, policies, FAQs, nearby attractions. Prices should also be in your Catalog.</p>
      {msg && <div className="banner">{msg}</div>}
      <div className="grid mb" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card"><h2>Paste text</h2><input placeholder="Title (e.g. Cancellation policy)" value={text.title} onChange={(e) => setText({ ...text, title: e.target.value })} /><textarea rows={5} style={{ marginTop: 8 }} value={text.text} onChange={(e) => setText({ ...text, text: e.target.value })} />
          <button className="btn mt" disabled={busy || !text.text.trim()} onClick={() => run(async () => { await api("/api/kb", "POST", text); setText({ title: "", text: "" }); }, "Added")}>Add</button></div>
        <div className="card"><h2>Read a web page</h2><input placeholder="https://yourresort.com/rooms" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn mt" disabled={busy || !url} onClick={() => run(async () => { await api("/api/kb", "POST", { url }); setUrl(""); }, "Page added")}>Add page</button>
          <h2 style={{ marginTop: 18 }}>Upload a file</h2><input ref={file} type="file" accept=".pdf,.txt,.md,.csv,.html" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; run(async () => { const fd = new FormData(); fd.append("file", f); const r = await fetch("/api/kb", { method: "POST", body: fd }); const d = await r.json(); if (!r.ok) throw new Error(d.error); }, "File added"); }} />
          <button className="btn ghost" disabled={busy} onClick={() => file.current?.click()}>Choose PDF or text file</button></div>
      </div>
      <div className="card mb" style={{ padding: 0 }}><table><thead><tr><th>Source</th><th>Type</th><th>Size</th><th>Added</th><th /></tr></thead>
        <tbody>{data?.map((s) => <tr key={s.id}><td>{s.title}<div className="muted small">{s.origin}</div></td><td><span className="pill">{s.kind}</span></td><td className="muted">{Math.round(s.chars / 100) / 10}k chars</td><td className="muted">{when(s.created_at)}</td>
          <td><a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { if (confirm("Remove this source?")) { await api(`/api/kb/${s.id}`, "DELETE"); reload(); } }}>remove</a></td></tr>)}</tbody></table>
        {data?.length === 0 && <p className="muted" style={{ padding: 16 }}>Nothing yet — add your rooms, rates and policies.</p>}</div>
      <div className="card"><h2>Test what it can find</h2><div className="row"><input placeholder="e.g. what time is check-in?" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn ghost" onClick={async () => setHits(await api(`/api/kb/search?q=${encodeURIComponent(q)}`))}>Search</button></div>
        {hits?.map((h, i) => <div key={i} className="check"><div><div className="small muted">{h.source}</div><div className="small">{h.text.slice(0, 260)}</div></div></div>)}{hits?.length === 0 && <p className="muted small">Nothing relevant found — the concierge would hand this question to your team.</p>}</div>
    </div>
  );
}

function Library() {
  const { data, reload } = useApi<any[]>("/api/assets");
  const file = useRef<HTMLInputElement>(null); const [label, setLabel] = useState(""); const [msg, setMsg] = useState("");
  return (
    <div style={{ maxWidth: 820 }}>
      <p className="muted">Photos, brochures and menus the concierge can send. Give each a clear label — it picks by label (e.g. &quot;Safari tent photos&quot;, &quot;Rates brochure&quot;).</p>
      <div className="card mb row wrap"><input style={{ maxWidth: 280 }} placeholder="Label, e.g. Safari tent photos" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input ref={file} type="file" hidden accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const fd = new FormData(); fd.append("file", f); fd.append("label", label); const r = await fetch("/api/assets", { method: "POST", body: fd }); const d = await r.json(); setMsg(r.ok ? "Uploaded" : d.error); setLabel(""); reload(); }} />
        <button className="btn" onClick={() => file.current?.click()}>Upload file</button><span className="muted small">{msg}</span></div>
      <div className="grid">{data?.map((a) => (
        <div key={a.id} className="card">
          {a.kind === "image" ? <img src={`/api/assets/${a.id}`} alt="" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10, marginBottom: 8 }} /> : <div className="pill" style={{ marginBottom: 8 }}>{a.kind}</div>}
          <input defaultValue={a.label} onBlur={async (e) => { if (e.target.value !== a.label) await api(`/api/assets/${a.id}`, "PATCH", { label: e.target.value }); }} />
          <input style={{ marginTop: 6 }} placeholder="When to use it (optional)" defaultValue={a.description} onBlur={async (e) => { await api(`/api/assets/${a.id}`, "PATCH", { description: e.target.value }); }} />
          <a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { if (confirm("Delete this file?")) { await api(`/api/assets/${a.id}`, "DELETE"); reload(); } }}>delete</a>
        </div>))}</div>
      {data?.length === 0 && <p className="muted">No files yet.</p>}
    </div>
  );
}

function Playground() {
  const [log, setLog] = useState<{ role: "user" | "assistant"; text: string; steps?: any[] }[]>([]); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function send() {
    const next = [...log, { role: "user" as const, text }]; setLog(next); setText(""); setBusy(true); setErr("");
    try { const r = await api("/api/ai/playground", "POST", { transcript: next.map(({ role, text }) => ({ role, text })) }); setLog([...next, { role: "assistant", text: r.reply ?? "(no reply)", steps: r.steps }]); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <p className="muted small">Chat as a guest. Nothing is sent to anyone or saved — you see what the concierge would say and do.</p>
      <div style={{ minHeight: 260, maxHeight: 460, overflow: "auto", display: "flex", flexDirection: "column", gap: 8, background: "var(--chat-bg)", borderRadius: 12, padding: 12 }}>
        {log.map((m, i) => (<div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
          <div className={"b " + (m.role === "user" ? "out" : "")} style={{ maxWidth: "100%" }}>{m.text}</div>
          {m.steps?.map((s, j) => <div key={j} className="small muted" style={{ marginTop: 4 }}>⚙ {s.tool}({Object.values(s.input ?? {}).map((v) => JSON.stringify(v)).join(", ").slice(0, 80)}) → {s.result.slice(0, 90)}</div>)}</div>))}
        {busy && <div className="muted small">Thinking…</div>}
      </div>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
      <div className="row mt"><input placeholder="Type as a guest, e.g. Do you have rooms for 3 people next weekend?" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim() && !busy) send(); }} /><button className="btn" disabled={busy || !text.trim()} onClick={send}>Send</button><button className="btn ghost" onClick={() => setLog([])}>Clear</button></div>
    </div>
  );
}
