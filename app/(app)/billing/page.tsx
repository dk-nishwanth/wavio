"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApi, when } from "@/components/api";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export default function Billing() {
  const { data, reload } = useApi<any>("/api/billing");
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [seats, setSeats] = useState(0);
  const [f, setF] = useState<any>(null);
  const [msg, setMsg] = useState("");
  if (!data) return null;
  const c = data.current;
  const bill = f ?? data.billing;
  const price = (p: any) => Math.round((p.price + seats * data.extraSeat) * data.periods[period].months * (1 - data.periods[period].discount));
  return (
    <>
      <div className="page-head"><div><h1>Billing</h1><p className="muted" style={{ margin: 0 }}>Plans, seats and GST invoices. WhatsApp conversation charges are billed by Meta at cost.</p></div></div>
      <div className="card mb row between" style={{ maxWidth: 760 }}>
        <div><span className="muted small">Current plan</span><div style={{ fontSize: 22, fontWeight: 600 }}>{data.plans.find((p: any) => p.key === c.plan).name} {c.trial && <span className="pill warn">trial</span>}{!c.active && <span className="pill bad">expired</span>}</div>
          <div className="muted small">{c.until ? `${c.active ? "Renews / ends" : "Ended"} ${when(c.until)}` : ""} · {data.seatsUsed} of {data.plans.find((p: any) => p.key === c.plan).seats + c.extraSeats} users</div></div>
      </div>
      {msg && <div className="banner">{msg}</div>}
      <div className="row mb"><span className="chip" style={{ cursor: "pointer", background: period === "monthly" ? "var(--brand)" : "", color: period === "monthly" ? "var(--on-brand)" : "" }} onClick={() => setPeriod("monthly")}>Monthly</span>
        <span className="chip" style={{ cursor: "pointer", background: period === "annual" ? "var(--brand)" : "", color: period === "annual" ? "var(--on-brand)" : "" }} onClick={() => setPeriod("annual")}>Annual · save 20%</span>
        <span className="muted small">Extra users: ₹{data.extraSeat}/month each</span><input type="number" min={0} style={{ width: 70 }} value={seats} onChange={(e) => setSeats(Math.max(0, Number(e.target.value)))} /></div>
      <div className="grid mb">
        {data.plans.map((p: any) => (
          <div key={p.key} className="card" style={{ outline: c.plan === p.key && !c.trial ? "2px solid var(--brand)" : "none" }}>
            <h2>{p.name}</h2><div style={{ fontSize: 28, fontWeight: 600 }}>{inr(price(p))}<span className="muted small"> / {period === "annual" ? "year" : "month"}</span></div>
            <p className="muted small">+ 18% GST</p><p>{p.blurb}</p>
            <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={async () => { try { const r = await api("/api/billing/checkout", "POST", { plan: p.key, period, extraSeats: seats }); location.href = r.link; } catch (e: any) { setMsg(e.message); } }}>{c.plan === p.key && !c.trial ? "Renew" : "Choose " + p.name}</button>
          </div>))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="card"><h2>GST details (shown on invoices)</h2>
          {["company", "gstin", "state", "address"].map((k) => <div key={k}><label>{({ company: "Company name", gstin: "GSTIN", state: "State (for CGST/SGST vs IGST)", address: "Billing address" } as any)[k]}</label><input value={bill[k] ?? ""} onChange={(e) => setF({ ...bill, [k]: e.target.value })} /></div>)}
          <button className="btn mt" onClick={async () => { await api("/api/billing", "PUT", bill); setF(null); reload(); setMsg("Saved"); }}>Save</button></div>
        <div className="card" style={{ padding: 0 }}><div style={{ padding: 18, paddingBottom: 6 }}><h2>Invoices</h2></div>
          <table><tbody>{data.invoices.map((i: any) => <tr key={i.id}><td>{i.number}<div className="muted small">{when(i.created_at)}</div></td><td>{inr(i.total)}</td><td><span className={"pill " + (i.status === "paid" ? "ok" : "warn")}>{i.status}</span></td>
            <td>{i.status === "paid" ? <Link className="small" style={{ textDecoration: "underline" }} href={`/invoices/${i.id}`}>View</Link> : <a className="small" style={{ textDecoration: "underline" }} href={i.payment_link}>Pay</a>}</td></tr>)}</tbody></table>
          {data.invoices.length === 0 && <p className="muted" style={{ padding: 18, paddingTop: 0 }}>No invoices yet.</p>}</div>
      </div>
    </>
  );
}
