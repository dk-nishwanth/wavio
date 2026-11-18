"use client";
import { useState } from "react";
import { useApi } from "@/components/api";

const dur = (ms: number | null) => (ms == null ? "—" : ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} sec` : ms < 3600_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 360_000) / 10} hr`);
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Stat({ label, value, prev, good = "up", hint }: { label: string; value: string | number; prev?: number | null; good?: "up" | "down"; hint?: string }) {
  const cur = typeof value === "number" ? value : null;
  const delta = cur != null && prev != null && prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const better = delta == null ? null : good === "up" ? delta >= 0 : delta <= 0;
  return (
    <div className="card stat"><span className="muted small">{label}</span><b>{value}</b>
      <span className="small" style={{ color: better == null ? "var(--muted)" : better ? "var(--tint-text)" : "var(--red-text)" }}>{delta == null ? hint ?? "" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs previous`}</span></div>
  );
}
function Bars({ data, labels }: { data: number[]; labels: string[] }) {
  const max = Math.max(1, ...data);
  return <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }}>{data.map((v, i) => <div key={i} title={`${labels[i]}: ${v}`} style={{ flex: 1, textAlign: "center" }}><div style={{ height: Math.max(2, (v / max) * 70), background: "var(--brand)", opacity: v ? 1 : 0.15, borderRadius: 3 }} /><div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{labels[i]}</div></div>)}</div>;
}

export default function Reports() {
  const [days, setDays] = useState(30);
  const { data: r } = useApi<any>(`/api/reports?days=${days}`);
  if (!r) return null;
  const c = r.current, p = r.previous;
  return (
    <>
      <div className="page-head"><div><h1>Reports</h1><p className="muted" style={{ margin: 0 }}>How the bot and your team are doing, compared with the {days} days before.</p></div>
        <select style={{ width: 150 }} value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></div>

      <h2>Guests and chats</h2>
      <div className="grid mb">
        <Stat label="New guests" value={c.newGuests} prev={p.newGuests} /><Stat label="Guests who wrote in" value={c.activeGuests} prev={p.activeGuests} /><Stat label="Guest messages" value={c.guestMessages} prev={p.guestMessages} />
        <Stat label="Answered by the bot alone" value={c.botAlonePct == null ? "—" : `${c.botAlonePct}%`} hint={`${c.botAloneGuests} guests, no team needed`} /><Stat label="Handed to the team" value={c.handedToTeam} prev={p.handedToTeam} good="down" />
      </div>

      <h2>Speed of reply</h2>
      <div className="grid mb">
        <div className="card stat"><span className="muted small">Bot — typical first reply</span><b>{dur(r.responseTimes.botMedianMs)}</b><span className="small muted">{r.responseTimes.botN} chats</span></div>
        <div className="card stat"><span className="muted small">Team — typical first reply</span><b>{dur(r.responseTimes.teamMedianMs)}</b><span className="small muted">{r.responseTimes.teamN} chats</span></div>
        <div className="card stat"><span className="muted small">Time to approve a request</span><b>{dur(c.approvalMedianMs)}</b><span className="small muted">median</span></div>
        <Stat label="Guest rating" value={c.ratingAvg == null ? "—" : `${c.ratingAvg} / 5`} hint={`${c.ratingCount} ratings`} />
      </div>

      <h2>Bookings</h2>
      <div className="grid mb">
        <Stat label="Booking requests" value={c.bookingRequests} prev={p.bookingRequests} /><Stat label="Approved" value={c.bookingsApproved} prev={p.bookingsApproved} /><Stat label="Stays in this period" value={c.staysRecorded} prev={p.staysRecorded} /><Stat label="Cancelled" value={c.cancelled} prev={p.cancelled} good="down" />
        <Stat label="Advances collected" value={inr(c.advancesCollected)} /><Stat label="Value of approved bookings" value={inr(c.estimatedBookingValue)} hint="from the bot's estimates" />
      </div>

      <div className="grid mb" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <div className="card"><h2>When guests write (hour of day)</h2><Bars data={r.hours} labels={r.hours.map((_: number, i: number) => String(i))} /></div>
        <div className="card"><h2>Busiest days</h2><Bars data={r.weekdays} labels={DAYS} /></div>
        <div className="card"><h2>Pipeline now</h2>{r.pipeline.map((x: any) => <div key={x.stage} className="row between small" style={{ padding: "4px 0" }}><span>{x.stage}</span><b>{x.n}</b></div>)}</div>
        <div className="card"><h2>Requests by type</h2>{Object.entries(r.requestsByKind.reduce((a: any, x: any) => ({ ...a, [x.kind]: (a[x.kind] ?? 0) + x.n }), {})).map(([k, n]: any) => <div key={k} className="row between small" style={{ padding: "4px 0" }}><span style={{ textTransform: "capitalize" }}>{k}</span><b>{n}</b></div>)}{r.requestsByKind.length === 0 && <p className="muted small">None yet.</p>}</div>
        <div className="card"><h2>Most-used answers</h2>{r.topAnswers.map((a: any) => <div key={a.keywords} className="row between small" style={{ padding: "4px 0" }}><span>{a.keywords}</span><b>{a.hits}×</b></div>)}{r.topAnswers.length === 0 && <p className="muted small">No taught answers used yet.</p>}</div>
        <div className="card"><h2>Still can&apos;t answer</h2>{r.unanswered.map((a: any) => <div key={a.text} className="row between small" style={{ padding: "4px 0" }}><span>{a.text}</span><b>{a.count}×</b></div>)}{r.unanswered.length === 0 && <p className="muted small">Nothing — nice.</p>}</div>
      </div>
      <p className="muted small">Replies the bot sent: {c.botReplies} · by your team: {c.teamReplies} · automated messages (reminders, confirmations): {c.automated}.</p>
    </>
  );
}
