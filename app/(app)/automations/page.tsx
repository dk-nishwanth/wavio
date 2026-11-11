"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/components/api";

type Step = any;
const blank = (t: string): Step => ({ send_text: { type: "send_text", text: "" }, send_template: { type: "send_template", template: "", params: [] }, buttons: { type: "buttons", text: "", buttons: ["Yes", "No"] }, wait: { type: "wait", minutes: 30 }, tag: { type: "tag", tag: "" }, set_stage: { type: "set_stage", stage: "contacted" }, http: { type: "http", url: "" } } as any)[t];

export default function Automations() {
  const { data, reload } = useApi<any[]>("/api/automations");
  const tpls = useApi<any[]>("/api/templates");
  const [f, setF] = useState<{ name: string; trigger_type: string; trigger_value: string; steps: Step[] }>({ name: "", trigger_type: "event", trigger_value: "", steps: [] });
  const [msg, setMsg] = useState("");
  const [packMsg, setPackMsg] = useState("");
  const upd = (i: number, patch: object) => setF({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const preset = (kind: string) => {
    if (kind === "cart") setF({ name: "Abandoned cart recovery", trigger_type: "event", trigger_value: "cart_updated", steps: [{ type: "wait", minutes: 60, unless_event: "order_placed" }, { type: "send_template", template: "", params: ["{{contact.name}}", "{{event.cart_url}}"] }] });
    if (kind === "order") setF({ name: "Order confirmation", trigger_type: "event", trigger_value: "order_placed", steps: [{ type: "send_template", template: "", params: ["{{contact.name}}", "{{event.order_id}}"] }] });
    if (kind === "faq") setF({ name: "Keyword reply", trigger_type: "keyword", trigger_value: "price, pricing", steps: [{ type: "send_text", text: "Thanks for asking! Our pricing starts at ₹499. A teammate will follow up shortly." }, { type: "tag", tag: "interested" }] });
  };
  return (
    <>
      <h1>Automations</h1><p className="muted mb">Trigger on a website event, a keyword, or a customer&apos;s first message, then run steps. A <b>wait</b> step with &quot;cancel if event&quot; handles abandoned carts.</p>
      <div className="card soft mb row between wrap"><div><b style={{ fontWeight: 600 }}>Resort starter pack</b><div className="muted small">Installs an enquiry chatbot, booking confirmation, 2-day check-in reminder, post-stay review request and 4 message templates. Edit anything afterwards.</div></div>
        <div className="row"><span className="muted small">{packMsg}</span><button className="btn" onClick={async () => { const r = await api("/api/starter/resort", "POST"); setPackMsg(r.created.length ? `Added ${r.created.length} items` : "Already installed"); reload(); }}>Install resort pack</button></div></div>
      <div className="row mb wrap"><Link href="/automations/flow/new" className="btn">+ New visual flow</Link><span className="muted small">or start a simple one from:</span>
        <button className="btn ghost" onClick={() => preset("order")}>Order confirmation</button><button className="btn ghost" onClick={() => preset("cart")}>Abandoned cart</button><button className="btn ghost" onClick={() => preset("faq")}>Keyword reply</button></div>
      <div className="card mb" style={{ maxWidth: 720 }}>
        <div className="row"><div className="grow"><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label>Trigger</label><select value={f.trigger_type} onChange={(e) => setF({ ...f, trigger_type: e.target.value })}><option value="event">Website event</option><option value="keyword">Keyword</option><option value="first_message">First message</option></select></div>
          {f.trigger_type !== "first_message" && <div className="grow"><label>{f.trigger_type === "event" ? "Event name" : "Keywords (comma-separated)"}</label><input value={f.trigger_value} onChange={(e) => setF({ ...f, trigger_value: e.target.value })} /></div>}</div>
        <h2 className="mt">Steps</h2>
        {f.steps.map((s, i) => (
          <div key={i} className="card mb" style={{ padding: 10 }}>
            <div className="row between"><b>{i + 1}. {s.type.replace("_", " ")}</b><a className="small muted" style={{ cursor: "pointer" }} onClick={() => setF({ ...f, steps: f.steps.filter((_, j) => j !== i) })}>remove</a></div>
            {s.type === "send_text" && <><textarea rows={2} value={s.text} onChange={(e) => upd(i, { text: e.target.value })} /><p className="small muted">Free text only works inside the 24h window (e.g. replying to a keyword).</p></>}
            {s.type === "send_template" && <><select value={s.template} onChange={(e) => upd(i, { template: e.target.value })}><option value="">Choose template…</option>{(tpls.data ?? []).filter((t) => t.status === "APPROVED").map((t) => <option key={t.id}>{t.name}</option>)}</select>
              <label>Variables, in order, one per line (use {"{{contact.name}}"}, {"{{event.order_id}}"})</label><textarea rows={2} value={(s.params ?? []).join("\n")} onChange={(e) => upd(i, { params: e.target.value.split("\n") })} /></>}
            {s.type === "buttons" && <><textarea rows={2} value={s.text} onChange={(e) => upd(i, { text: e.target.value })} /><label>Buttons (max 3, one per line)</label><textarea rows={2} value={s.buttons.join("\n")} onChange={(e) => upd(i, { buttons: e.target.value.split("\n").slice(0, 3) })} /></>}
            {s.type === "wait" && <div className="row"><input type="number" style={{ width: 100 }} value={s.minutes} onChange={(e) => upd(i, { minutes: Number(e.target.value) })} /><span>minutes. Cancel the run if event</span><input placeholder="order_placed (optional)" value={s.unless_event ?? ""} onChange={(e) => upd(i, { unless_event: e.target.value || undefined })} /></div>}
            {s.type === "tag" && <input placeholder="tag" value={s.tag} onChange={(e) => upd(i, { tag: e.target.value })} />}
            {s.type === "set_stage" && <select value={s.stage} onChange={(e) => upd(i, { stage: e.target.value })}>{["new", "contacted", "qualified", "proposal", "won", "lost"].map((x) => <option key={x}>{x}</option>)}</select>}
            {s.type === "http" && <input placeholder="https://your-site.com/hook" value={s.url} onChange={(e) => upd(i, { url: e.target.value })} />}
          </div>))}
        <div className="row wrap">{["send_text", "send_template", "buttons", "wait", "tag", "set_stage", "http"].map((t) => <button key={t} className="btn ghost" onClick={() => setF({ ...f, steps: [...f.steps, blank(t)] })}>+ {t.replace("_", " ")}</button>)}</div>
        {msg && <p style={{ color: "var(--danger)" }}>{msg}</p>}
        <button className="btn mt" disabled={!f.steps.length} onClick={async () => { try { await api("/api/automations", "POST", f); setF({ name: "", trigger_type: "event", trigger_value: "", steps: [] }); setMsg(""); reload(); } catch (e: any) { setMsg(e.message); } }}>Save automation</button>
      </div>
      <div className="card" style={{ padding: 0 }}><table><thead><tr><th>Name</th><th>Trigger</th><th>Steps</th><th>Active</th><th /></tr></thead>
        <tbody>{data?.map((a) => <tr key={a.id}><td>{a.graph ? <Link href={`/automations/flow/${a.id}`} style={{ textDecoration: "underline" }}>{a.name}</Link> : a.name}{a.graph && <span className="pill info" style={{ marginLeft: 6 }}>flow</span>}</td><td><span className="pill">{a.trigger_type}</span> {a.trigger_value}</td><td className="small">{a.graph ? `${a.graph.nodes.length - 1} steps` : a.steps.map((s: any) => s.type).join(" → ")}</td>
          <td><input type="checkbox" style={{ width: "auto" }} checked={!!a.active} onChange={async (e) => { await api(`/api/automations/${a.id}`, "PATCH", { active: e.target.checked }); reload(); }} /></td>
          <td><a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { await api(`/api/automations/${a.id}`, "DELETE"); reload(); }}>delete</a></td></tr>)}</tbody></table></div>
    </>
  );
}
