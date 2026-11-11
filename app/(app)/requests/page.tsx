"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApi, when } from "@/components/api";

const TONE: Record<string, string> = { open: "warn", approved: "info", done: "ok", declined: "bad" };
const KIND: Record<string, string> = { booking: "Booking", cancellation: "Cancellation", change: "Change", service: "Service", callback: "Callback", complaint: "Complaint", handoff: "Needs a person", other: "Other" };

export default function Requests() {
  const [filter, setFilter] = useState("open");
  const { data, reload } = useApi<any>(`/api/requests${filter === "all" ? "" : `?status=${filter}`}`, 5000);
  const [msg, setMsg] = useState("");
  return (
    <>
      <div className="page-head"><div><h1>Requests</h1><p className="muted" style={{ margin: 0 }}>What guests asked the concierge for. Bookings, cancellations and changes wait here for your approval.</p></div></div>
      <div className="row mb">{["open", "approved", "done", "declined", "all"].map((f) => <span key={f} className="chip" style={{ cursor: "pointer", background: filter === f ? "var(--brand)" : "", color: filter === f ? "var(--on-brand)" : "" }} onClick={() => setFilter(f)}>{f}{f === "open" && data?.open ? ` (${data.open})` : ""}</span>)}</div>
      {msg && <div className="banner">{msg}</div>}
      <div style={{ display: "grid", gap: 12, maxWidth: 820 }}>
        {data?.requests.map((r: any) => <Card key={r.id} r={r} onDone={(m: string) => { setMsg(m); reload(); }} />)}
        {data?.requests.length === 0 && <p className="muted">Nothing here.</p>}
      </div>
    </>
  );
}

function Card({ r, onDone }: { r: any; onDone: (m: string) => void }) {
  const [advance, setAdvance] = useState(""); const [message, setMessage] = useState(""); const [err, setErr] = useState("");
  const d = r.details ?? {};
  const act = async (action: string) => { setErr(""); try { await api(`/api/requests/${r.id}`, "POST", { action, advance: advance || undefined, message: message || undefined }); onDone(`Request ${action === "approve" ? "approved" : action === "decline" ? "declined" : "closed"}`); } catch (e: any) { setErr(e.message); } };
  return (
    <div className="card">
      <div className="row between"><div className="row"><span className="pill info" style={{ margin: 0 }}>{KIND[r.kind]}</span><b style={{ fontWeight: 600 }}>{r.name || "+" + r.phone}</b></div><span className={"pill " + TONE[r.status]} style={{ margin: 0 }}>{r.status === "approved" ? "awaiting advance" : r.status}</span></div>
      <p style={{ margin: "8px 0" }}>{r.summary}</p>
      {Object.keys(d).length > 0 && <div className="small muted">{Object.entries(d).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}</div>}
      <div className="small muted mt">{when(r.created_at)} · {r.created_by === "ai" ? "raised by the concierge" : "added by your team"} <Link href="/inbox" style={{ textDecoration: "underline", marginLeft: 8 }}>open chat</Link></div>
      {r.status === "open" && (<>
        {r.kind === "booking" && <div className="row mt"><div style={{ width: 200 }}><label>Advance to collect (₹, optional)</label><input type="number" min={0} value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0 = confirm now" /></div><p className="muted small" style={{ margin: "20px 0 0" }}>With an advance, the guest gets a payment link and the stay is confirmed when they pay.</p></div>}
        <label>Message to the guest (optional)</label><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={r.kind === "booking" ? "Great news — we can host you!" : "We're on it."} />
        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
        <div className="row mt">{["booking", "cancellation"].includes(r.kind) ? <button className="btn" onClick={() => act("approve")}>Approve</button> : <button className="btn" onClick={() => act("done")}>Mark done</button>}<button className="btn ghost" onClick={() => act("decline")}>Decline</button></div>
      </>)}
    </div>
  );
}
