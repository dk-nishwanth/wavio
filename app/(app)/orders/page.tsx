"use client";
import { useState } from "react";
import { api, useApi, when } from "@/components/api";

const tone: Record<string, string> = { pending: "warn", paid: "ok", fulfilled: "info", cancelled: "bad" };

export default function Orders() {
  const { data, reload } = useApi<any[]>("/api/orders", 4000);
  const contacts = useApi<any[]>("/api/contacts");
  const products = useApi<any[]>("/api/products");
  const [contactId, setContactId] = useState(""); const [cart, setCart] = useState<Record<string, number>>({}); const [msg, setMsg] = useState("");
  const active = (products.data ?? []).filter((p) => p.active);
  const lines = active.filter((p) => cart[p.id] > 0).map((p) => ({ product_id: p.id, qty: cart[p.id] }));
  return (
    <>
      <div className="page-head"><div><h1>Orders</h1><p className="muted" style={{ margin: 0 }}>Create an order for a customer, then send them a payment link in the chat. Paid orders move the lead to Won.</p></div></div>
      {msg && <div className="banner ok">{msg}</div>}
      <div className="card mb" style={{ maxWidth: 620 }}>
        <h2>New order</h2>
        <label>Customer</label>
        <select value={contactId} onChange={(e) => setContactId(e.target.value)}><option value="">Choose a contact…</option>{contacts.data?.map((c) => <option key={c.id} value={c.id}>{c.name || "+" + c.phone}</option>)}</select>
        <label>Items</label>
        {active.map((p) => <div key={p.id} className="row between" style={{ padding: "4px 0" }}><span>{p.name} <span className="muted small">₹{p.price}</span></span><input type="number" min={0} style={{ width: 80 }} value={cart[p.id] ?? 0} onChange={(e) => setCart({ ...cart, [p.id]: Number(e.target.value) })} /></div>)}
        {active.length === 0 && <p className="muted small">Add products in Catalog first.</p>}
        <div className="row mt"><button className="btn" disabled={!contactId || !lines.length} onClick={async () => { try { const r = await api("/api/orders", "POST", { contactId, items: lines }); setMsg(`Order #${r.number} created`); setCart({}); reload(); } catch (e: any) { setMsg(e.message); } }}>Create order</button></div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th /></tr></thead>
          <tbody>{data?.map((o) => (
            <tr key={o.id}><td>#{o.number}<div className="muted small">{when(o.created_at)}</div></td><td>{o.name || "+" + o.phone}</td>
              <td className="small">{o.items.map((i: any) => `${i.name} × ${i.qty}`).join(", ")}</td><td>₹{o.total.toLocaleString("en-IN")}</td>
              <td><span className={"pill " + tone[o.status]}>{o.status}</span></td>
              <td className="row" style={{ justifyContent: "flex-end" }}>
                {o.status === "pending" && <button className="btn ghost" onClick={async () => { try { await api(`/api/orders/${o.id}`, "POST"); setMsg(`Payment link sent in chat for #${o.number}`); reload(); } catch (e: any) { setMsg(e.message); } }}>Send payment link</button>}
                {o.status === "paid" && <button className="btn ghost" onClick={async () => { await api(`/api/orders/${o.id}`, "PATCH", { status: "fulfilled" }); reload(); }}>Mark fulfilled</button>}
                {o.status === "pending" && <button className="btn ghost" onClick={async () => { await api(`/api/orders/${o.id}`, "PATCH", { status: "cancelled" }); reload(); }}>Cancel</button>}
              </td></tr>))}</tbody></table>
      </div>
    </>
  );
}
