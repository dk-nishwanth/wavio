"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/components/api";

type Item =
  | { from: "guest"; text: string }
  | { from: "bot"; kind: "text"; text: string; ai?: boolean }
  | { from: "bot"; kind: "list"; body: string; button: string; rows: { title: string; description?: string }[] }
  | { from: "bot"; kind: "buttons"; body: string; options: string[] }
  | { from: "bot"; kind: "location"; name: string; address?: string; lat?: number; lng?: number }
  | { from: "bot"; kind: "file"; label: string }
  | { from: "bot"; kind: "link"; body: string; label: string; url: string }
  | { from: "note"; text: string };

const EXAMPLES = ["hii sir pls tell rates", "wat r the room rates", "i want 2 book rooom for 4 ppl from 20dec to 23 decmber", "bhai room book karna hai", "do u have swiming pool", "wher r u locatd", "check in time?", "need airport pikup", "can u share photos", "cancel my booking", "i want to talk to manager", "रेट क्या है", "tmrw for 2 nights 3 ppl"];

/** One bot output from the "nothing is saved" test mode → something to draw. */
function fromTool(t: any, files: Record<string, string>): Item | null {
  const i = t.input ?? {};
  switch (t.tool) {
    case "send_menu": return { from: "bot", kind: "list", body: i.body, button: i.button, rows: i.options ?? [] };
    case "quick_replies": return { from: "bot", kind: "buttons", body: i.text, options: i.options ?? [] };
    case "send_file": return t.ok ? { from: "bot", kind: "file", label: i.label } : { from: "note", text: `⚠️ ${t.result}` };
    case "send_location": return { from: "bot", kind: "location", name: "Your resort", address: "" };
    case "send_link": return { from: "bot", kind: "link", body: i.body, label: i.label, url: i.url };
    case "create_request": return { from: "note", text: t.ok ? `📝 Would send a ${i.kind} request to your team: ${i.summary}${i.details?.check_in_date ? ` (${i.details.check_in_date} → ${i.details.check_out_date}, ${i.details.guests} guests${i.details.room ? `, ${i.details.room}` : ""})` : ""}` : `⚠️ ${t.result}` };
    case "handoff_to_human": return { from: "note", text: `🙋 Would hand this chat to a person: ${i.reason}` };
    case "save_details": return { from: "note", text: `💾 Would save the guest's details` };
    default: return null;
  }
}

/** One saved chat message (real-run mode) → something to draw. */
function fromMessage(m: any): Item | null {
  if (m.is_note) return null;
  if (m.direction === "in") return { from: "guest", text: m.body };
  let p: any = {}; try { p = m.params ? JSON.parse(m.params) : {}; } catch { /* plain text */ }
  switch (m.type) {
    case "list": return { from: "bot", kind: "list", body: p.body ?? m.body, button: p.button ?? "Choose", rows: p.sections?.[0]?.rows ?? [] };
    case "buttons": return { from: "bot", kind: "buttons", body: m.body, options: Array.isArray(p) ? p : [] };
    case "location": return { from: "bot", kind: "location", name: p.name ?? "Location", address: p.address, lat: p.latitude, lng: p.longitude };
    case "cta_url": return { from: "bot", kind: "link", body: p.body ?? m.body, label: p.label ?? "Open", url: p.url };
    case "image": case "video": case "document": case "audio": return { from: "bot", kind: "file", label: m.media_name ?? m.type };
    default: return { from: "bot", kind: "text", text: m.body, ai: !!m.ai };
  }
}

export default function TestBot() {
  const [mode, setMode] = useState<"safe" | "real">("safe");
  const [items, setItems] = useState<Item[]>([]); const [state, setState] = useState<any>(undefined);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [debug, setDebug] = useState<any>(null); const [sheet, setSheet] = useState<Extract<Item, { kind: "list" }> | null>(null);
  const [notice, setNotice] = useState("");
  const info = useApi<any>("/api/test/chat");
  const assets = useApi<any[]>("/api/assets");
  const settings = useApi<any>("/api/settings");
  const [convId, setConvId] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const files: Record<string, string> = Object.fromEntries((assets.data ?? []).map((a) => [a.label.toLowerCase(), a.id]));
  const lastIsFresh = useRef(0);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [items.length, busy]);
  useEffect(() => { if (info.data?.conversationId && !convId) setConvId(info.data.conversationId); }, [info.data, convId]);

  // real-run mode shows the saved chat, refreshed every second or two
  const real = useApi<any>(mode === "real" && convId ? `/api/conversations/${convId}` : null, 1500);
  const shown: Item[] = mode === "real" ? ((real.data?.messages ?? []).map(fromMessage).filter(Boolean) as Item[]) : items;
  const reqs = useApi<any>(mode === "real" ? "/api/requests?status=open" : null, 3000);
  const myReqs = (reqs.data?.requests ?? []).filter((r: any) => r.phone === "10000000001");

  async function send(msg: string) {
    const m = msg.trim(); if (!m || busy) return;
    setText(""); setErr(""); setNotice(""); setBusy(true);
    try {
      if (mode === "safe") {
        setItems((it) => [...it, { from: "guest", text: m }]);
        const transcript = [...items.filter((x) => x.from === "guest" || (x.from === "bot" && x.kind === "text")).map((x: any) => ({ role: x.from === "guest" ? "user" : "assistant", text: x.text })), { role: "user", text: m }];
        const r = await api("/api/ai/playground", "POST", { transcript, state });
        setState(r.state); setDebug(r.debug ?? null);
        const out: Item[] = r.outputs ? (r.outputs as any[]).map((o) => (o.type === "text" ? ({ from: "bot", kind: "text", text: o.text } as Item) : fromTool(o, files))).filter(Boolean) as Item[] : [{ from: "bot", kind: "text", text: r.reply ?? "(no reply)" }];
        setItems((it) => [...it, ...out]);
      } else {
        const r = await api("/api/test/chat", "POST", { text: m });
        setConvId(r.conversationId); setDebug(r.debug ?? null); info.reload(); real.reload();
        if (r.handledBy === "off") setNotice("The bot is switched off — turn it on in Guest Bot → Behaviour.");
        if (r.handledBy === "paused") setNotice("The bot handed this chat to a person, so it stays quiet. Press Start over to try again.");
        if (r.handledBy === "flow") setNotice("A scripted chatbot flow (Automations) answered this instead of the bot.");
        setTimeout(() => real.reload(), 600);
      }
    } catch (e: any) { setErr(e.message); }
    setBusy(false); lastIsFresh.current++;
  }
  async function reset() {
    setItems([]); setState(undefined); setDebug(null); setNotice(""); setErr("");
    if (mode === "real") { await api("/api/test/reset", "POST"); setConvId(null); info.reload(); }
  }

  const bubble = (it: Item, i: number) => {
    if (it.from === "note") return <div key={i} className="small muted" style={{ textAlign: "center", padding: "4px 12px" }}>{it.text}</div>;
    if (it.from === "guest") return <div key={i} className="b out" style={{ alignSelf: "flex-end" }}>{it.text}</div>;
    switch (it.kind) {
      case "text": return <div key={i} className="b">{it.ai ? "🤖 " : ""}{it.text}</div>;
      case "buttons": return (<div key={i} style={{ maxWidth: "78%" }}><div className="b">{it.body}</div><div style={{ display: "grid", gap: 4, marginTop: 4 }}>{it.options.map((o) => <button key={o} className="b" style={{ textAlign: "center", color: "#027eb5", cursor: "pointer", border: 0, font: "inherit" }} onClick={() => send(o)}>{o}</button>)}</div></div>);
      case "list": return (<div key={i} style={{ maxWidth: "78%" }}><div className="b">{it.body}</div><button className="b" style={{ width: "100%", textAlign: "center", color: "#027eb5", cursor: "pointer", border: 0, font: "inherit", marginTop: 4 }} onClick={() => setSheet(it)}>☰ {it.button}</button></div>);
      case "location": return <div key={i} className="b"><b>📍 {it.name}</b>{it.address && <div className="small">{it.address}</div>}{it.lat != null ? <a className="small" style={{ color: "#027eb5" }} href={`https://maps.google.com/?q=${it.lat},${it.lng}`} target="_blank" rel="noreferrer">Open map</a> : <div className="small muted">(your saved map pin or link is sent here)</div>}</div>;
      case "file": { const id = files[it.label.toLowerCase()]; return <div key={i} className="b">{id ? <img src={`/api/assets/${id}`} alt="" style={{ maxWidth: 220, borderRadius: 8, display: "block" }} /> : <span>📎 {it.label}</span>}<div className="small muted">{it.label}</div></div>; }
      case "link": return <div key={i} style={{ maxWidth: "78%" }}><div className="b">{it.body}</div><a className="b" style={{ display: "block", textAlign: "center", color: "#027eb5", marginTop: 4 }} href={it.url} target="_blank" rel="noreferrer">🔗 {it.label}</a></div>;
    }
  };

  return (
    <>
      <div className="page-head"><div><h1>Test the bot</h1><p className="muted" style={{ margin: 0 }}>Chat as a guest and see exactly what the bot would reply — including tappable room lists and buttons. Try typos, Hinglish, anything.</p></div></div>
      <div className="row mb wrap">
        <span className="chip" style={{ cursor: "pointer", background: mode === "safe" ? "var(--brand)" : "", color: mode === "safe" ? "var(--on-brand)" : "" }} onClick={() => { setMode("safe"); setNotice(""); }}>Practice — nothing is saved</span>
        <span className="chip" style={{ cursor: "pointer", background: mode === "real" ? "var(--brand)" : "", color: mode === "real" ? "var(--on-brand)" : "" }} onClick={() => { setMode("real"); setNotice(""); }}>Full test — creates real requests</span>
        <span className="muted small">{mode === "safe" ? "Safe to experiment. Requests and bookings are only described, not created." : "A pretend guest is used: requests land in Requests, bookings in Stays. Replies never go to WhatsApp. Press Start over to clean up."}</span>
      </div>
      {mode === "real" && info.data && !info.data.botOn && <div className="banner">The bot is switched off, so it won&apos;t answer. <Link href="/concierge" style={{ textDecoration: "underline" }}>Turn it on</Link>.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,400px) 1fr", gap: 20, alignItems: "start" }} className="testgrid">
        <div style={{ border: "10px solid #1f2937", borderRadius: 34, overflow: "hidden", background: "var(--chat-bg)", boxShadow: "var(--shadow)" }}>
          <div style={{ background: "#075e54", color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}><span className="avatar" style={{ background: "#128c7e" }}>{(settings.data?.business?.name || "R").slice(0, 1)}</span><div><div style={{ fontWeight: 600 }}>{settings.data?.business?.name || "Your resort"}</div><div style={{ fontSize: 11, opacity: 0.8 }}>{busy ? "typing…" : "online"}</div></div></div>
          <div className="msgs" style={{ height: 460, background: "var(--chat-bg)" }}>
            {shown.length === 0 && <p className="muted small" style={{ textAlign: "center", margin: "auto" }}>Say hello, or tap an example →</p>}
            {shown.map(bubble)}
            {notice && <div className="small" style={{ textAlign: "center", color: "var(--amber-text)", background: "var(--amber)", borderRadius: 8, padding: 6 }}>{notice}</div>}
            {busy && <div className="b"><span className="muted">…</span></div>}
            <div ref={end} />
          </div>
          {err && <div className="small" style={{ color: "var(--danger)", padding: "4px 10px", background: "var(--panel)" }}>{err}</div>}
          <div className="row" style={{ padding: 8, background: "var(--panel)" }}><input placeholder="Type a message" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(text); }} /><button className="btn" disabled={busy || !text.trim()} onClick={() => send(text)}>Send</button></div>
          {sheet && (<div style={{ position: "absolute" }} />)}
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div className="card"><div className="row between"><h2 style={{ margin: 0 }}>Try these</h2><button className="btn ghost" onClick={reset}>Start over</button></div>
            <div className="row wrap" style={{ marginTop: 10 }}>{EXAMPLES.map((x) => <button key={x} className="pill" style={{ cursor: "pointer", font: "inherit", margin: 0 }} onClick={() => send(x)}>{x}</button>)}</div></div>
          <div className="card"><h2>How the bot understood that</h2>
            {!debug ? <p className="muted small">Send a message to see what it made of it.</p> : (<>
              <div className="small muted">Cleaned-up text</div><div style={{ marginBottom: 8 }}><code>{debug.clean || "—"}</code></div>
              <div className="small muted">Decided to</div><div style={{ marginBottom: 8 }}><span className={"pill " + (debug.route === "not understood" ? "bad" : "ok")}>{debug.route || "—"}</span></div>
              <div className="small muted">Guessed intents</div><div style={{ marginBottom: 8 }}>{debug.intents?.length ? debug.intents.map((x: any) => <span key={x.intent} className="pill">{x.intent} · {x.score}</span>) : <span className="muted small">none</span>}</div>
              <div className="row wrap small"><div><span className="muted">Dates:</span> {debug.dates?.check_in ? `${debug.dates.check_in}${debug.dates.check_out ? " → " + debug.dates.check_out : ""}` : "—"}</div><div><span className="muted">Guests:</span> {debug.guests ?? "—"}</div><div><span className="muted">Language:</span> {debug.lang}</div>{debug.step && <div><span className="muted">Waiting for:</span> {debug.step}</div>}</div>
              {mode === "safe" && state?.slots && Object.keys(state.slots).length > 0 && <div className="small mt"><span className="muted">Remembers:</span> {Object.entries(state.slots).filter(([k]) => k !== "waiting").map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>}
              {debug.route === "not understood" && <p className="small mt" style={{ margin: 0 }}>It didn&apos;t understand this. Teach it in <Link href="/concierge" style={{ textDecoration: "underline" }}>Guest Bot → Hotel bot</Link>.</p>}
            </>)}
          </div>
          {mode === "real" && <div className="card"><h2>Requests this test created</h2>{myReqs.length === 0 ? <p className="muted small">None yet. Ask for a booking, a pickup or to speak to a manager.</p> : myReqs.map((r: any) => <div key={r.id} className="check"><div><span className="pill info" style={{ margin: 0 }}>{r.kind}</span> {r.summary}</div></div>)}<p className="small muted" style={{ margin: "8px 0 0" }}>Approve or decline them in <Link href="/requests" style={{ textDecoration: "underline" }}>Requests</Link>; approved stays appear in <Link href="/stays" style={{ textDecoration: "underline" }}>Stays</Link>.</p></div>}
        </div>
      </div>

      {sheet && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 30, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setSheet(null)}>
          <div className="card" style={{ width: "min(420px,100%)", borderRadius: "16px 16px 0 0", maxHeight: "70vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="row between"><h2 style={{ margin: 0 }}>{sheet.button}</h2><a className="muted" style={{ cursor: "pointer" }} onClick={() => setSheet(null)}>✕</a></div>
            {sheet.rows.map((r) => <div key={r.title} className="check" style={{ cursor: "pointer" }} onClick={() => { setSheet(null); send(r.title); }}><div><b style={{ fontWeight: 500 }}>{r.title}</b>{r.description && <div className="small muted">{r.description}</div>}</div></div>)}
          </div>
        </div>
      )}
      <style>{`@media(max-width:900px){.testgrid{grid-template-columns:1fr !important}}`}</style>
    </>
  );
}
