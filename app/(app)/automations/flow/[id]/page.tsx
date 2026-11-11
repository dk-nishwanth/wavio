"use client";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { api, useApi } from "@/components/api";

type N = { id: string; type: string; x: number; y: number; data: Record<string, any> };
type E = { id: string; from: string; port: string; to: string };

const W = 232, HEAD = 36, BODY = 52, PORT = 26;
const META: Record<string, { label: string; color: string; ports?: (d: any) => { id: string; label: string }[] }> = {
  trigger: { label: "Trigger", color: "#063b26" },
  send_text: { label: "Send message", color: "#0f9d58" },
  send_template: { label: "Send template", color: "#0f9d58" },
  buttons: { label: "Ask with buttons", color: "#2563eb", ports: (d) => [...(d.buttons ?? []).map((b: string, i: number) => ({ id: String(i), label: b || `Button ${i + 1}` })), { id: "other", label: "Anything else" }] },
  ask: { label: "Ask a question", color: "#2563eb" },
  wait: { label: "Wait", color: "#d97706" },
  condition: { label: "Condition", color: "#7c3aed", ports: () => [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] },
  tag: { label: "Add tag", color: "#475569" },
  set_stage: { label: "Set lead stage", color: "#475569" },
  handoff: { label: "Hand off to human", color: "#dc2626" },
  http: { label: "Call webhook", color: "#475569" },
};
const portsOf = (n: N) => META[n.type]?.ports?.(n.data) ?? [{ id: "out", label: "Next" }];
const height = (n: N) => HEAD + BODY + portsOf(n).length * PORT + 6;
const outPos = (n: N, port: string) => ({ x: n.x + W, y: n.y + HEAD + BODY + portsOf(n).findIndex((p) => p.id === port) * PORT + PORT / 2 });
const inPos = (n: N) => ({ x: n.x, y: n.y + HEAD / 2 });
const summary = (n: N) => {
  const d = n.data;
  switch (n.type) {
    case "trigger": return d.trigger_type === "first_message" ? "First message from a contact" : `${d.trigger_type === "event" ? "Event" : "Keyword"}: ${d.trigger_value || "—"}`;
    case "send_text": case "buttons": case "ask": return d.text || "Empty message";
    case "send_template": return d.template || "Choose a template";
    case "wait": return `${d.minutes ?? 0} minutes`;
    case "condition": return `${d.field ?? "tag"} ${d.op ?? "="} ${d.value ?? ""}`;
    case "tag": return d.tag || "—";
    case "set_stage": return d.stage || "—";
    case "http": return d.url || "—";
    default: return "";
  }
};
const uid = () => Math.random().toString(36).slice(2, 9);

export default function FlowEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = id === "new";
  const existing = useApi<any>(isNew ? null : `/api/automations/${id}`);
  const tpls = useApi<any[]>("/api/templates");
  const [name, setName] = useState("New chatbot flow");
  const [nodes, setNodes] = useState<N[]>([{ id: "trigger", type: "trigger", x: 40, y: 60, data: { trigger_type: "keyword", trigger_value: "hi, hello" } }]);
  const [edges, setEdges] = useState<E[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [from, setFrom] = useState<{ node: string; port: string } | null>(null);
  const [msg, setMsg] = useState(""); const [saving, setSaving] = useState(false);
  const loaded = useRef(false);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loaded.current || !existing.data) return;
    loaded.current = true;
    setName(existing.data.name);
    if (existing.data.graph) { setNodes(existing.data.graph.nodes); setEdges(existing.data.graph.edges); }
  }, [existing.data]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current; const box = canvas.current?.getBoundingClientRect();
      if (!d || !box) return;
      setNodes((ns) => ns.map((n) => (n.id === d.id ? { ...n, x: Math.max(0, e.clientX - box.left + canvas.current!.scrollLeft - d.dx), y: Math.max(0, e.clientY - box.top + canvas.current!.scrollTop - d.dy) } : n)));
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  const node = nodes.find((n) => n.id === sel) ?? null;
  const setData = (patch: object) => setNodes((ns) => ns.map((n) => (n.id === sel ? { ...n, data: { ...n.data, ...patch } } : n)));
  const defaults: Record<string, any> = {
    send_text: { text: "" }, send_template: { template: "", params: [] }, buttons: { text: "Choose an option:", buttons: ["Yes", "No"] }, ask: { text: "What's your email?", variable: "email", save_to_contact: true },
    wait: { minutes: 60 }, condition: { field: "tag", value: "", op: "eq", key: "" }, tag: { tag: "" }, set_stage: { stage: "contacted" }, handoff: {}, http: { url: "" },
  };
  function add(type: string) {
    const max = nodes.reduce((m, n) => Math.max(m, n.y + height(n)), 0);
    const nn: N = { id: uid(), type, x: 40 + (nodes.length % 3) * 40, y: max + 30, data: { ...defaults[type] } };
    setNodes([...nodes, nn]); setSel(nn.id);
  }
  function connect(to: string) {
    if (!from || from.node === to) return setFrom(null);
    setEdges((es) => [...es.filter((e) => !(e.from === from.node && e.port === from.port)), { id: uid(), from: from.node, port: from.port, to }]);
    setFrom(null);
  }
  function remove() {
    if (!sel || sel === "trigger") return;
    setNodes(nodes.filter((n) => n.id !== sel)); setEdges(edges.filter((e) => e.from !== sel && e.to !== sel)); setSel(null);
  }

  async function save() {
    setSaving(true); setMsg("");
    try {
      const t = nodes.find((n) => n.type === "trigger")!;
      const body = { name, trigger_type: t.data.trigger_type, trigger_value: t.data.trigger_value ?? "", graph: { nodes, edges }, steps: [] };
      if (isNew) { const r = await api("/api/automations", "POST", body); location.href = `/automations/flow/${r.id}`; }
      else { await api(`/api/automations/${id}`, "PATCH", body); setMsg("Saved"); }
    } catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  }

  const approved = (tpls.data ?? []).filter((t) => t.status === "APPROVED");
  const cw = Math.max(1400, ...nodes.map((n) => n.x + W + 200)), ch = Math.max(800, ...nodes.map((n) => n.y + height(n) + 200));

  return (
    <>
      <div className="page-head">
        <div className="row"><Link href="/automations" className="btn ghost">← Back</Link><input style={{ width: 280, fontWeight: 600 }} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="row">{msg && <span className="muted small">{msg}</span>}{existing.data?.runs?.length > 0 && <span className="chip">{existing.data.runs.map((r: any) => `${r.n} ${r.status}`).join(" · ")}</span>}<button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save flow"}</button></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 290px", gap: 14, height: "calc(100vh - 130px)" }}>
        <div className="card" style={{ overflow: "auto", padding: 12 }}>
          <h2>Add step</h2>
          {Object.entries(META).filter(([k]) => k !== "trigger").map(([k, m]) => (
            <button key={k} className="btn ghost" style={{ width: "100%", marginBottom: 6, justifyContent: "flex-start" }} onClick={() => add(k)}><span style={{ width: 8, height: 8, borderRadius: 8, background: m.color }} />{m.label}</button>
          ))}
          <p className="muted small">Drag steps to move. Click a ● port on the right of a step, then click the target step to connect.</p>
        </div>

        <div ref={canvas} className="card" style={{ position: "relative", overflow: "auto", padding: 0, background: "var(--soft)", backgroundImage: "radial-gradient(var(--line-2) 1px, transparent 1px)", backgroundSize: "20px 20px" }} onClick={() => { setSel(null); setFrom(null); }}>
          <div style={{ position: "relative", width: cw, height: ch }}>
            <svg width={cw} height={ch} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {edges.map((e) => {
                const a = nodes.find((n) => n.id === e.from), b = nodes.find((n) => n.id === e.to);
                if (!a || !b) return null;
                const p = outPos(a, e.port), q = inPos(b), mx = (p.x + q.x) / 2;
                return (
                  <g key={e.id}>
                    <path d={`M${p.x},${p.y} C${mx + 40},${p.y} ${mx - 40},${q.y} ${q.x},${q.y}`} fill="none" stroke="#94a3b8" strokeWidth={2} />
                    <g style={{ pointerEvents: "all", cursor: "pointer" }} onClick={(ev) => { ev.stopPropagation(); setEdges(edges.filter((x) => x.id !== e.id)); }}>
                      <circle cx={mx} cy={(p.y + q.y) / 2} r={9} fill="var(--panel)" stroke="#94a3b8" /><text x={mx} y={(p.y + q.y) / 2 + 4} textAnchor="middle" fontSize="12" fill="#64748b">×</text>
                    </g>
                  </g>
                );
              })}
            </svg>
            {nodes.map((n) => {
              const m = META[n.type];
              return (
                <div key={n.id} onClick={(e) => { e.stopPropagation(); from ? connect(n.id) : setSel(n.id); }}
                  style={{ position: "absolute", left: n.x, top: n.y, width: W, height: height(n), background: "var(--panel)", borderRadius: 14, border: `2px solid ${sel === n.id ? m.color : "var(--line-2)"}`, boxShadow: "var(--shadow)", userSelect: "none", outline: from && from.node !== n.id ? "2px dashed var(--brand)" : "none" }}>
                  <div onPointerDown={(e) => { e.stopPropagation(); const box = canvas.current!.getBoundingClientRect(); drag.current = { id: n.id, dx: e.clientX - box.left + canvas.current!.scrollLeft - n.x, dy: e.clientY - box.top + canvas.current!.scrollTop - n.y }; setSel(n.id); }}
                    style={{ height: HEAD, background: m.color, color: "#fff", borderRadius: "11px 11px 0 0", padding: "0 12px", display: "flex", alignItems: "center", fontWeight: 600, fontSize: 13, cursor: "grab" }}>{m.label}</div>
                  <div className="muted" style={{ height: BODY, padding: "8px 12px", fontSize: 12, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{summary(n)}</div>
                  {portsOf(n).map((p, i) => (
                    <div key={p.id} style={{ height: PORT, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 14px 0 12px", fontSize: 12, borderTop: i === 0 ? "1px solid var(--line)" : "none", position: "relative" }}>
                      <span className="muted">{p.label}</span>
                      <span onClick={(e) => { e.stopPropagation(); setFrom({ node: n.id, port: p.id }); }} title="Connect"
                        style={{ position: "absolute", right: -7, width: 14, height: 14, borderRadius: 14, background: from?.node === n.id && from.port === p.id ? "var(--brand)" : edges.some((e) => e.from === n.id && e.port === p.id) ? "#94a3b8" : "var(--panel)", border: "2px solid #94a3b8", cursor: "crosshair" }} />
                    </div>
                  ))}
                  {n.type !== "trigger" && <span style={{ position: "absolute", left: -7, top: HEAD / 2 - 7, width: 14, height: 14, borderRadius: 14, background: "var(--panel)", border: "2px solid #94a3b8" }} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ overflow: "auto" }}>
          {!node && <><h2>Flow settings</h2><p className="muted small">Select a step to edit it. Messages support placeholders: <code>{"{{contact.name}}"}</code>, <code>{"{{event.order_id}}"}</code>, <code>{"{{vars.email}}"}</code>.</p><p className="muted small">Button and question steps pause the flow until the customer replies. Free text only works within 24 hours of their last message; use a template after that.</p></>}
          {node && (<>
            <div className="row between"><h2>{META[node.type].label}</h2>{node.type !== "trigger" && <a className="small" style={{ color: "var(--danger)", cursor: "pointer" }} onClick={remove}>Delete step</a>}</div>
            {node.type === "trigger" && (<>
              <label>Starts when</label>
              <select value={node.data.trigger_type} onChange={(e) => setData({ trigger_type: e.target.value })}><option value="keyword">Customer sends a keyword</option><option value="first_message">Customer&apos;s first message</option><option value="event">Website event happens</option></select>
              {node.data.trigger_type !== "first_message" && (<><label>{node.data.trigger_type === "event" ? "Event name" : "Keywords (comma-separated)"}</label><input value={node.data.trigger_value ?? ""} onChange={(e) => setData({ trigger_value: e.target.value })} /></>)}
            </>)}
            {["send_text", "buttons", "ask"].includes(node.type) && (<><label>Message</label><textarea rows={4} value={node.data.text ?? ""} onChange={(e) => setData({ text: e.target.value })} /></>)}
            {node.type === "buttons" && (<><label>Buttons (max 3, one per line, 20 characters each)</label><textarea rows={3} value={(node.data.buttons ?? []).join("\n")} onChange={(e) => setData({ buttons: e.target.value.split("\n").slice(0, 3) })} /></>)}
            {node.type === "ask" && (<><label>Save the answer as</label><input value={node.data.variable ?? ""} onChange={(e) => setData({ variable: e.target.value.replace(/\W/g, "_") })} />
              <label className="row"><input type="checkbox" checked={!!node.data.save_to_contact} onChange={(e) => setData({ save_to_contact: e.target.checked })} /> Also save on the contact</label></>)}
            {node.type === "send_template" && (<><label>Template</label><select value={node.data.template ?? ""} onChange={(e) => setData({ template: e.target.value })}><option value="">Choose…</option>{approved.map((t) => <option key={t.id}>{t.name}</option>)}</select>
              <label>Variables (one per line)</label><textarea rows={3} value={(node.data.params ?? []).join("\n")} onChange={(e) => setData({ params: e.target.value.split("\n") })} /></>)}
            {node.type === "wait" && (<><label>Wait (minutes)</label><input type="number" value={node.data.minutes ?? 0} onChange={(e) => setData({ minutes: Number(e.target.value) })} /></>)}
            {node.type === "condition" && (<><label>Check</label><select value={node.data.field} onChange={(e) => setData({ field: e.target.value })}><option value="tag">Contact has tag</option><option value="attr">Contact attribute</option><option value="var">Answer saved earlier</option><option value="stage">Lead stage</option></select>
              {["attr", "var"].includes(node.data.field) && (<><label>Name</label><input value={node.data.key ?? ""} onChange={(e) => setData({ key: e.target.value })} /></>)}
              {node.data.field !== "tag" && (<><label>Operator</label><select value={node.data.op} onChange={(e) => setData({ op: e.target.value })}><option value="eq">equals</option><option value="neq">does not equal</option><option value="contains">contains</option></select></>)}
              <label>Value</label><input value={node.data.value ?? ""} onChange={(e) => setData({ value: e.target.value })} /></>)}
            {node.type === "tag" && (<><label>Tag</label><input value={node.data.tag ?? ""} onChange={(e) => setData({ tag: e.target.value })} /></>)}
            {node.type === "set_stage" && (<><label>Stage</label><select value={node.data.stage} onChange={(e) => setData({ stage: e.target.value })}>{["new", "contacted", "qualified", "proposal", "won", "lost"].map((s) => <option key={s}>{s}</option>)}</select></>)}
            {node.type === "http" && (<><label>URL (receives a POST with the contact and answers)</label><input value={node.data.url ?? ""} onChange={(e) => setData({ url: e.target.value })} /></>)}
            {node.type === "handoff" && <p className="muted small">Pauses automations on this chat so a human can take over. It appears in the Inbox unassigned.</p>}
          </>)}
        </div>
      </div>
    </>
  );
}
