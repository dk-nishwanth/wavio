"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi } from "@/components/api";

export default function Setup() {
  const status = useApi<any>("/api/setup/status");
  const settings = useApi<any>("/api/settings");
  const faq = useApi<any>("/api/setup/faqs");
  const rooms = useApi<any[]>("/api/products");
  const [b, setB] = useState<any>(null); const [msg, setMsg] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const blank = { name: "", price: "", weekend_price: "", capacity: "2", units: "1", meal_plan: "", description: "" };
  const [room, setRoom] = useState(blank);
  useEffect(() => { if (settings.data && !b) setB({ industry: "resort", ...settings.data.business }); }, [settings.data, b]);
  useEffect(() => { if (faq.data) setAnswers((a) => (Object.keys(a).length ? a : faq.data.answers)); }, [faq.data]);
  const say = (k: string, v: string) => setMsg((m) => ({ ...m, [k]: v }));
  const set = (k: string) => (e: any) => setB({ ...b, [k]: e.target.value });
  if (!status.data || !b) return null;
  const st = status.data;

  return (
    <>
      <div className="page-head"><div><h1>Setup</h1><p className="muted" style={{ margin: 0 }}>Get the guest bot ready in about 15 minutes. Each section saves on its own — do them in any order.</p></div><span className="chip">{st.done} of {st.total} done</span></div>
      <div className="bar mb"><i style={{ width: `${(st.done / st.total) * 100}%` }} /></div>
      <div className="row mb wrap">{st.steps.map((s: any) => <Link key={s.key} href={s.href} className={"pill " + (s.done ? "ok" : "warn")}>{s.done ? "✓" : "•"} {s.title}</Link>)}</div>

      <div className="card mb" id="resort" style={{ maxWidth: 760 }}>
        <h2>1. Your resort</h2>
        <div className="row"><div className="grow"><label>Name</label><input value={b.name ?? ""} onChange={set("name")} /></div><div className="grow"><label>Town / region</label><input value={b.location ?? ""} onChange={set("location")} /></div></div>
        <label>Full address</label><input value={b.address ?? ""} onChange={set("address")} />
        <div className="row"><div className="grow"><label>Reception phone</label><input value={b.phone ?? ""} onChange={set("phone")} /></div><div className="grow"><label>Google Maps link</label><input value={b.maps_url ?? ""} onChange={set("maps_url")} placeholder="https://maps.app.goo.gl/…" /></div></div>
        <div className="row"><div className="grow"><label>Check-in</label><input value={b.check_in_time ?? "12:00 PM"} onChange={set("check_in_time")} /></div><div className="grow"><label>Check-out</label><input value={b.check_out_time ?? "11:00 AM"} onChange={set("check_out_time")} /></div><div className="grow"><label>Team online from</label><input type="time" value={b.hours_open ?? ""} onChange={set("hours_open")} /></div><div className="grow"><label>until</label><input type="time" value={b.hours_close ?? ""} onChange={set("hours_close")} /></div></div>
        <label>Google review link (optional)</label><input value={b.google_review_url ?? ""} onChange={set("google_review_url")} />
        <div className="row mt"><button className="btn" onClick={async () => { await api("/api/settings", "PUT", { industry: "resort", business: { ...b, hours_open: b.hours_open || undefined, hours_close: b.hours_close || undefined } }); say("resort", "Saved"); status.reload(); }}>Save</button><span className="muted small">{msg.resort}</span></div>
      </div>

      <div className="card mb" id="rooms" style={{ maxWidth: 760 }}>
        <h2>2. Rooms and rates</h2>
        {rooms.data?.map((r) => <div key={r.id} className="check" style={{ alignItems: "center" }}><div className="grow"><b style={{ fontWeight: 500 }}>{r.name}</b> <span className="muted small">₹{r.price.toLocaleString("en-IN")}/night{r.weekend_price ? ` · ₹${r.weekend_price.toLocaleString("en-IN")} Fri–Sat` : ""} · sleeps {r.capacity} · {r.units} available{r.meal_plan ? ` · ${r.meal_plan}` : ""}</span></div><a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { if (confirm(`Delete ${r.name}?`)) { await api(`/api/products/${r.id}`, "DELETE"); rooms.reload(); status.reload(); } }}>delete</a></div>)}
        <div className="row wrap mt"><div className="grow"><label>Room type</label><input value={room.name} onChange={(e) => setRoom({ ...room, name: e.target.value })} placeholder="Safari Tent" /></div><div style={{ width: 120 }}><label>₹ per night</label><input type="number" value={room.price} onChange={(e) => setRoom({ ...room, price: e.target.value })} /></div><div style={{ width: 120 }}><label>Fri–Sat ₹</label><input type="number" value={room.weekend_price} onChange={(e) => setRoom({ ...room, weekend_price: e.target.value })} /></div><div style={{ width: 80 }}><label>Sleeps</label><input type="number" min={1} value={room.capacity} onChange={(e) => setRoom({ ...room, capacity: e.target.value })} /></div><div style={{ width: 80 }}><label>How many</label><input type="number" min={1} value={room.units} onChange={(e) => setRoom({ ...room, units: e.target.value })} /></div></div>
        <div className="row"><div className="grow"><label>Inclusions</label><input value={room.meal_plan} onChange={(e) => setRoom({ ...room, meal_plan: e.target.value })} placeholder="Breakfast included" /></div><div className="grow"><label>One-line description</label><input value={room.description} onChange={(e) => setRoom({ ...room, description: e.target.value })} /></div></div>
        <div className="row mt"><button className="btn" disabled={!room.name || !room.price} onClick={async () => { try { await api("/api/products", "POST", room); setRoom(blank); say("rooms", ""); rooms.reload(); status.reload(); } catch (e: any) { say("rooms", e.message); } }}>Add room</button><span className="muted small">{msg.rooms}</span></div>
      </div>

      <div className="card mb" id="answers" style={{ maxWidth: 760 }}>
        <h2>3. Common questions</h2>
        <p className="muted small">Answer the ones that apply; leave the rest blank. Guests who ask these get your exact words — in any spelling, including Hinglish.</p>
        {faq.data?.templates.map((t: any) => (<div key={t.key}><label>{t.question} <span className="muted">· listens for: {t.keywords}</span></label><textarea rows={2} value={answers[t.key] ?? ""} placeholder={t.hint} onChange={(e) => setAnswers({ ...answers, [t.key]: e.target.value })} /></div>))}
        <div className="row mt"><button className="btn" onClick={async () => { const r = await api("/api/setup/faqs", "POST", { answers }); say("answers", `${r.saved} answers saved`); status.reload(); }}>Save answers</button><span className="muted small">{msg.answers}</span></div>
      </div>

      <div className="card" style={{ maxWidth: 760 }}>
        <h2>4. Photos, testing and going live</h2>
        <div className="check"><div>Upload room photos and a brochure in <Link href="/concierge" style={{ textDecoration: "underline" }}>Guest Bot → Library</Link>, with clear labels like &quot;Safari tent photos&quot;.</div></div>
        <div className="check"><div>Try it in <Link href="/concierge" style={{ textDecoration: "underline" }}>Guest Bot → Playground</Link> with messy messages — <i>&quot;hii sir pls tell rates&quot;</i>, <i>&quot;rooom for 4 ppl 20 dec to 23 dec&quot;</i>.</div></div>
        <div className="check"><div>Switch the bot on in <Link href="/concierge" style={{ textDecoration: "underline" }}>Guest Bot → Behaviour</Link>. It stays in test mode until WhatsApp is connected.</div></div>
        <div className="check"><div>Connect your WhatsApp number in <Link href="/settings" style={{ textDecoration: "underline" }}>Settings</Link> when you&apos;re ready.</div></div>
      </div>
    </>
  );
}
