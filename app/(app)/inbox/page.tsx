"use client";
import { useEffect, useRef, useState } from "react";
import { api, useApi, when } from "@/components/api";

const tick: Record<string, string> = { queued: "⏳", sent: "✓", delivered: "✓✓", read: "✓✓", failed: "⚠", received: "" };

export default function Inbox() {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const list = useApi<any[]>(`/api/conversations?filter=${filter}&q=${encodeURIComponent(q)}`, 3000);
  const chat = useApi<any>(sel ? `/api/conversations/${sel}` : null, 2500);
  const tpls = useApi<any[]>("/api/templates");
  const settings = useApi<any>("/api/settings");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(""); const [note, setNote] = useState(false); const [err, setErr] = useState("");
  const [tpl, setTpl] = useState(""); const [tplParams, setTplParams] = useState("");
  const c0: string | null = chat.data?.conversation?.contact_id ?? null;
  const stays = useApi<any[]>(c0 ? `/api/stays?contactId=${c0}` : null, 8000);
  const [stay, setStay] = useState({ check_in_date: "", check_out_date: "", guests: "2", room: "" });
  const [sim, setSim] = useState({ phone: "", text: "Hi!" });
  const bottom = useRef<HTMLDivElement>(null);
  const n = chat.data?.messages?.length;
  useEffect(() => { bottom.current?.scrollIntoView(); }, [n, sel]);
  const c = chat.data?.conversation;

  async function send() {
    setErr("");
    try {
      if (file) {
        const form = new FormData(); form.append("file", file); form.append("caption", text);
        const res = await fetch(`/api/conversations/${sel}/media`, { method: "POST", body: form });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Upload failed");
        setFile(null); setText(""); chat.reload(); list.reload(); return;
      }
      if (tpl) await api(`/api/conversations/${sel}/messages`, "POST", { template: tpl, params: tplParams ? tplParams.split("|").map((x) => x.trim()) : [] });
      else await api(`/api/conversations/${sel}/messages`, "POST", { text, note });
      setText(""); setTpl(""); setTplParams(""); chat.reload(); list.reload();
    } catch (e: any) { setErr(e.message); }
  }
  async function patch(b: object) { await api(`/api/conversations/${sel}`, "PATCH", b); chat.reload(); list.reload(); }
  const approved = (tpls.data ?? []).filter((t) => t.status === "APPROVED");

  return (
    <div className="inbox">
      <div className="list">
        <div style={{ padding: 10 }}>
          <input placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="row wrap small" style={{ marginTop: 8 }}>
            {["all", "mine", "unassigned", "unread", "closed"].map((f) => (
              <span key={f} className={"pill" + (filter === f ? " ok" : "")} style={{ cursor: "pointer" }} onClick={() => setFilter(f)}>{f}</span>
            ))}
          </div>
        </div>
        {list.data?.map((r) => (
          <div key={r.id} className={"item" + (sel === r.id ? " on" : "")} onClick={() => setSel(r.id)}>
            <div className="t"><b>{r.name || "+" + r.phone}</b>{r.unread > 0 && <span className="dot">{r.unread}</span>}</div>
            <div className="p">{r.last_preview}</div>
          </div>
        ))}
        {list.data?.length === 0 && <p className="muted" style={{ padding: 14 }}>No conversations yet. Use the simulator below, or connect WhatsApp in Settings.</p>}
        {settings.data?.devTools && <details style={{ padding: 10 }}>
          <summary className="small muted">Simulate an inbound message</summary>
          <label>Phone</label><input value={sim.phone} onChange={(e) => setSim({ ...sim, phone: e.target.value })} placeholder="919876543210" />
          <label>Text</label><input value={sim.text} onChange={(e) => setSim({ ...sim, text: e.target.value })} />
          <button className="btn mt" onClick={async () => { await api("/api/dev/simulate", "POST", sim); list.reload(); }}>Simulate</button>
        </details>}
      </div>

      <div className="chat">
        {!c ? <p className="muted" style={{ padding: 20 }}>Select a conversation</p> : (<>
          <div className="row between" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
            <div><b>{c.name || "+" + c.phone}</b> <span className="muted small">+{c.phone}</span>
              {!c.opted_in && <span className="pill bad">opted out</span>}</div>
            <div className="row">
              <select style={{ width: 150 }} value={c.assigned_to ?? ""} onChange={(e) => patch({ assigned_to: e.target.value })}>
                <option value="">Unassigned</option>{chat.data.agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button className="btn ghost" onClick={() => patch({ status: c.status === "closed" ? "open" : "closed" })}>{c.status === "closed" ? "Reopen" : "Close"}</button>
            </div>
          </div>
          <div className="msgs">
            {chat.data.messages.map((m: any) => (
              <div key={m.id} className={"b " + (m.is_note ? "note" : m.direction)}>
                {(m.media_id || m.media_path) && (() => {
                  const src = `/api/media/${m.id}`;
                  if (!m.media_path) return <div className="muted small">Downloading attachment…</div>;
                  if (m.type === "image" || m.type === "sticker") return <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 8, display: "block" }} /></a>;
                  if (m.type === "video") return <video src={src} controls style={{ maxWidth: 260, borderRadius: 8 }} />;
                  if (m.type === "audio" || m.type === "voice") return <audio src={src} controls style={{ maxWidth: 260 }} />;
                  return <a href={src} className="pill" style={{ margin: 0 }}>📄 {m.media_name || "Document"}</a>;
                })()}
                {m.is_note ? "📝 " : ""}{m.ai ? "🤖 " : ""}{m.body && !/^\[(image|video|audio|document|sticker|voice)\]$/.test(m.body) ? m.body : ""}
                <small>{m.template_name ? `template · ${m.template_name} · ` : ""}{when(m.created_at)} {m.direction === "out" && !m.is_note ? tick[m.status] : ""}{m.error ? ` — ${m.error}` : ""}</small>
              </div>
            ))}
            <div ref={bottom} />
          </div>
          <div className="composer">
            {!c.windowOpen && !note && <p className="small" style={{ color: "var(--danger)", margin: "0 0 6px" }}>The 24-hour window is closed — you can only send an approved template.</p>}
            {err && <p className="small" style={{ color: "var(--danger)", margin: "0 0 6px" }}>{err}</p>}
            <div className="row wrap">
              <select style={{ width: 200 }} value={tpl} onChange={(e) => setTpl(e.target.value)}>
                <option value="">Free text{c.windowOpen ? "" : " (disabled)"}</option>{approved.map((t) => <option key={t.id} value={t.name}>Template: {t.name}</option>)}
              </select>
              {tpl && <input style={{ flex: 1 }} placeholder="Variables separated by |  e.g. Asha | #1042" value={tplParams} onChange={(e) => setTplParams(e.target.value)} />}
            </div>
            {file && <div className="row small mt"><span className="pill">📎 {file.name}</span><a className="muted" style={{ cursor: "pointer" }} onClick={() => setFile(null)}>remove</a></div>}
            {!tpl && <div className="row mt"><textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={note ? "Internal note (not sent)" : "Type a message"} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} /></div>}
            <div className="row between mt">
              <div className="row"><input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg,audio/ogg,audio/aac,audio/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} /><button className="btn ghost" type="button" onClick={() => fileInput.current?.click()} disabled={!!tpl || note}>📎 Attach</button>
              <label className="row small" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={note} onChange={(e) => setNote(e.target.checked)} /> Internal note</label></div>
              <button className="btn" onClick={send} disabled={!tpl && !file && !text.trim()}>{note ? "Add note" : "Send"}</button>
            </div>
          </div>
        </>)}
      </div>

      <div className="info">
        {c && (<>
          <h2>Contact</h2>
          <p style={{ margin: 0 }}>{c.name || "—"}<br /><span className="muted">+{c.phone}</span><br /><span className="muted">{c.email}</span></p>
          <label>Tags</label>
          <div>{c.tags.map((t: string) => <span key={t} className="pill">{t}</span>)}</div>
          <input style={{ marginTop: 6 }} placeholder="Add tag + Enter" onKeyDown={async (e) => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === "Enter" && v) { await patch({ tags: [...c.tags, v] }); (e.target as HTMLInputElement).value = ""; } }} />
          <label>Bot</label>
          <button className="btn ghost" onClick={() => patch({ bot_paused: !c.bot_paused })}>{c.bot_paused ? "Resume bot" : "Pause bot"}</button>
          <p className="small muted">The bot (chatbot flows and AI concierge) pauses automatically when a team member replies or the concierge hands over.</p>
          <h2 className="mt">Stays</h2>
          {(stays.data ?? []).map((x) => (
            <div key={x.booking_id} className="card soft" style={{ padding: 10, marginBottom: 8 }}>
              <div className="row between"><b style={{ fontWeight: 600 }}>{x.booking_id}</b><span className={"pill " + (x.status === "cancelled" ? "bad" : x.status === "upcoming" ? "warn" : "ok")}>{x.status.replace("_", " ")}</span></div>
              <div className="small">{x.check_in} → {x.check_out}<br />{x.guests} guests {x.room && `· ${x.room}`}</div>
              {x.status === "upcoming" && <a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { if (confirm("Cancel this stay? Pending reminders stop.")) { await api("/api/stays/cancel", "POST", { contactId: c0, booking_id: x.booking_id }); stays.reload(); } }}>cancel stay</a>}
            </div>))}
          <details><summary className="small muted" style={{ cursor: "pointer" }}>Record a booking</summary>
            <label>Check-in</label><input type="date" value={stay.check_in_date} onChange={(e) => setStay({ ...stay, check_in_date: e.target.value })} />
            <label>Check-out</label><input type="date" value={stay.check_out_date} onChange={(e) => setStay({ ...stay, check_out_date: e.target.value })} />
            <div className="row"><div className="grow"><label>Guests</label><input type="number" value={stay.guests} onChange={(e) => setStay({ ...stay, guests: e.target.value })} /></div><div className="grow"><label>Room (optional)</label><input value={stay.room} onChange={(e) => setStay({ ...stay, room: e.target.value })} /></div></div>
            <button className="btn mt" disabled={!stay.check_in_date || !stay.check_out_date} onClick={async () => { try { await api("/api/stays", "POST", { contactId: c0, ...stay }); setStay({ check_in_date: "", check_out_date: "", guests: "2", room: "" }); stays.reload(); } catch (e: any) { setErr(e.message); } }}>Confirm booking</button>
            <p className="muted small">Starts the confirmation, reminder and review messages.</p></details>
          {Object.keys(c.attrs).length > 0 && (<><label>Attributes</label><pre>{JSON.stringify(c.attrs, null, 1)}</pre></>)}
        </>)}
      </div>
    </div>
  );
}
