"use client";
import { useMemo, useState } from "react";
import { api, useApi } from "@/components/api";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const COLOR: Record<string, string> = { upcoming: "#f59e0b", in_house: "#16a34a", past: "#94a3b8", cancelled: "#ef4444" };

export default function Stays() {
  const stays = useApi<any[]>("/api/stays", 10000);
  const rooms = useApi<any[]>("/api/products");
  const [start, setStart] = useState(iso(new Date()));
  const [span, setSpan] = useState(14);
  const blank = { phone: "", name: "", room: "", check_in_date: "", check_out_date: "", guests: "2", optIn: false };
  const [f, setF] = useState(blank); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const days = useMemo(() => Array.from({ length: span }, (_, i) => addDays(start, i)), [start, span]);
  const live = (stays.data ?? []).filter((s) => s.status !== "cancelled" && s.status !== "past");
  const today = iso(new Date());
  const roomNames = [...(rooms.data ?? []).filter((r) => r.active).map((r) => r.name), "Not assigned"];
  const rowOf = (s: any) => (roomNames.find((r) => r.toLowerCase() === String(s.room ?? "").toLowerCase()) ?? "Not assigned");

  async function add(force = false) {
    setErr(""); setMsg("");
    try { const r = await api("/api/stays/manual", "POST", { ...f, force }); setMsg(`Booking ${r.booking_id} recorded`); setF(blank); stays.reload(); }
    catch (e: any) { setErr(e.message); if (/fully booked/.test(e.message) && confirm(e.message)) add(true); }
  }
  const cancel = async (s: any) => { if (confirm(`Cancel ${s.booking_id}? Pending reminders stop.`)) { await api("/api/stays/cancel", "POST", { contactId: s.contact_id, booking_id: s.booking_id }); stays.reload(); } };

  return (
    <>
      <div className="page-head"><div><h1>Stays</h1><p className="muted" style={{ margin: 0 }}>Who is arriving, in the house and leaving, and which rooms are taken. Bookings approved from Requests appear here automatically.</p></div><a className="btn ghost" href="/api/export/stays">Download CSV</a></div>
      <div className="grid mb">
        {[["Arriving today", live.filter((s) => s.check_in_date === today)], ["In the house", live.filter((s) => s.status === "in_house")], ["Leaving today", live.filter((s) => s.check_out_date === today)], ["Arriving tomorrow", live.filter((s) => s.check_in_date === addDays(today, 1))]].map(([t, list]: any) => (
          <div key={t} className="card"><span className="muted small">{t}</span><div style={{ fontSize: 28, fontWeight: 600 }}>{list.length}</div><div className="small muted">{list.slice(0, 3).map((s: any) => s.name || s.phone).join(", ")}</div></div>))}
      </div>

      <div className="card mb" style={{ overflow: "auto" }}>
        <div className="row between mb"><h2 style={{ margin: 0 }}>Room calendar</h2>
          <div className="row"><button className="btn ghost" onClick={() => setStart(addDays(start, -span))}>←</button><input type="date" style={{ width: 160 }} value={start} onChange={(e) => setStart(e.target.value || today)} /><button className="btn ghost" onClick={() => setStart(addDays(start, span))}>→</button>
            <select style={{ width: 100 }} value={span} onChange={(e) => setSpan(Number(e.target.value))}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></div></div>
        <table style={{ tableLayout: "fixed", minWidth: 120 + span * 46 }}>
          <thead><tr><th style={{ width: 120 }}>Room</th>{days.map((d) => <th key={d} style={{ width: 46, textAlign: "center", background: d === today ? "var(--tint)" : undefined, padding: "6px 2px" }}>{new Date(d + "T00:00:00").getDate()}<div style={{ fontWeight: 400, fontSize: 10 }}>{new Date(d + "T00:00:00").toLocaleDateString("en", { weekday: "short" })}</div></th>)}</tr></thead>
          <tbody>{roomNames.map((room) => (
            <tr key={room}><td style={{ fontWeight: 500 }}>{room}</td>
              {days.map((d) => { const hits = live.filter((s) => rowOf(s) === room && s.check_in_date <= d && d < s.check_out_date); return (
                <td key={d} style={{ padding: 2, background: d === today ? "var(--tint)" : undefined }}>
                  {hits.map((s) => <div key={s.booking_id} title={`${s.booking_id} · ${s.name || s.phone} · ${s.check_in} → ${s.check_out} · ${s.guests} guests`} style={{ background: COLOR[s.status], color: "#fff", borderRadius: 4, fontSize: 10, padding: "2px 3px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginBottom: 1 }}>{s.check_in_date === d ? (s.name || s.phone).split(" ")[0] : "·"}</div>)}
                </td>); })}</tr>))}</tbody>
        </table>
        <p className="small muted">Amber = upcoming, green = in the house. Hover a bar for details. Add rooms under Catalog.</p>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Add a booking (walk-in or phone)</h2>
          <div className="row"><div className="grow"><label>Guest phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="9876543210" /></div><div className="grow"><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div></div>
          <div className="row"><div className="grow"><label>Check-in</label><input type="date" value={f.check_in_date} onChange={(e) => setF({ ...f, check_in_date: e.target.value })} /></div><div className="grow"><label>Check-out</label><input type="date" value={f.check_out_date} onChange={(e) => setF({ ...f, check_out_date: e.target.value })} /></div></div>
          <div className="row"><div className="grow"><label>Room</label><select value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })}><option value="">Not assigned</option>{rooms.data?.filter((r) => r.active).map((r) => <option key={r.id}>{r.name}</option>)}</select></div><div style={{ width: 100 }}><label>Guests</label><input type="number" min={1} value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} /></div></div>
          <label className="row"><input type="checkbox" checked={f.optIn} onChange={(e) => setF({ ...f, optIn: e.target.checked })} /> Guest agreed to get WhatsApp updates about this stay</label>
          {err && <p style={{ color: "var(--danger)" }}>{err}</p>}{msg && <p className="muted">{msg}</p>}
          <button className="btn mt" disabled={!f.phone || !f.check_in_date || !f.check_out_date} onClick={() => add()}>Record booking</button>
        </div>
        <div className="card" style={{ padding: 0, gridColumn: "span 2" }}>
          <table><thead><tr><th>Booking</th><th>Guest</th><th>Room</th><th>Dates</th><th>Status</th><th /></tr></thead>
            <tbody>{(stays.data ?? []).filter((s) => s.status !== "past").slice(0, 40).map((s) => <tr key={s.booking_id}><td>{s.booking_id}</td><td>{s.name || "+" + s.phone}<div className="muted small">{s.guests} guests</div></td><td>{s.room || "—"}</td><td className="small">{s.check_in} → {s.check_out}</td>
              <td><span className={"pill " + (s.status === "cancelled" ? "bad" : s.status === "in_house" ? "ok" : "warn")}>{s.status.replace("_", " ")}</span></td><td>{s.status === "upcoming" && <a className="small muted" style={{ cursor: "pointer" }} onClick={() => cancel(s)}>cancel</a>}</td></tr>)}</tbody></table>
          {(stays.data ?? []).filter((s) => s.status !== "past").length === 0 && <p className="muted" style={{ padding: 16 }}>No bookings yet.</p>}
        </div>
      </div>
    </>
  );
}
