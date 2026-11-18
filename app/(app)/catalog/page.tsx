"use client";
import { useState } from "react";
import { api, useApi } from "@/components/api";

export default function Catalog() {
  const { data, reload } = useApi<any[]>("/api/products");
  const blank = { name: "", price: "", description: "", image_url: "", capacity: "2", units: "1", weekend_price: "", meal_plan: "" };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  return (
    <>
      <div className="page-head"><div><h1>Catalog</h1><p className="muted" style={{ margin: 0 }}>Rooms, packages or products you can add to a booking/order and collect an advance for with a payment link.</p></div></div>
      <div className="card mb" style={{ maxWidth: 560 }}>
        <h2>Add product</h2>
        <div className="row"><div className="grow"><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div><div style={{ width: 130 }}><label>Price (₹)</label><input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div></div>
        <label>Description</label><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="row"><div style={{ width: 120 }}><label>Sleeps</label><input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></div><div style={{ width: 120 }}><label>How many</label><input type="number" min={1} value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} /></div><div style={{ width: 170 }}><label>Fri–Sat rate (₹, optional)</label><input type="number" value={f.weekend_price} onChange={(e) => setF({ ...f, weekend_price: e.target.value })} /></div><div className="grow"><label>Meals / inclusions</label><input value={f.meal_plan} onChange={(e) => setF({ ...f, meal_plan: e.target.value })} placeholder="Breakfast included" /></div></div>
        <label>Image URL (optional)</label><input value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value })} />
        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
        <button className="btn mt" onClick={async () => { try { await api("/api/products", "POST", f); setF(blank); setErr(""); reload(); } catch (e: any) { setErr(e.message); } }}>Add product</button>
      </div>
      <div className="grid">
        {data?.map((p) => (
          <div key={p.id} className="card" style={{ opacity: p.active ? 1 : 0.55 }}>
            {p.image_url && <img src={p.image_url} alt="" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10, marginBottom: 10 }} />}
            <div className="row between"><b style={{ fontWeight: 600 }}>{p.name}</b><b>₹{p.price.toLocaleString("en-IN")}</b></div>
            <p className="muted small" style={{ margin: "4px 0 6px" }}>{p.description}</p>
            <div className="small muted" style={{ marginBottom: 8 }}>Sleeps {p.capacity} · {p.units} available{p.weekend_price ? ` · Fri–Sat ₹${p.weekend_price.toLocaleString("en-IN")}` : ""}{p.meal_plan ? ` · ${p.meal_plan}` : ""}</div>
            <div className="row small" style={{ marginBottom: 8 }}><span className="muted">Sleeps</span><input type="number" min={1} style={{ width: 60 }} defaultValue={p.capacity} onBlur={async (e) => { await api(`/api/products/${p.id}`, "PATCH", { capacity: e.target.value }); reload(); }} /><span className="muted">Rooms</span><input type="number" min={1} style={{ width: 60 }} defaultValue={p.units} onBlur={async (e) => { await api(`/api/products/${p.id}`, "PATCH", { units: e.target.value }); reload(); }} /><span className="muted">₹/night</span><input type="number" style={{ width: 90 }} defaultValue={p.price} onBlur={async (e) => { await api(`/api/products/${p.id}`, "PATCH", { price: e.target.value }); reload(); }} /></div>
            <div className="row between"><label className="row small" style={{ margin: 0 }}><input type="checkbox" checked={!!p.active} onChange={async (e) => { await api(`/api/products/${p.id}`, "PATCH", { active: e.target.checked }); reload(); }} /> Active</label>
              <a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { if (confirm("Delete product?")) { await api(`/api/products/${p.id}`, "DELETE"); reload(); } }}>delete</a></div>
          </div>
        ))}
      </div>
      {data?.length === 0 && <p className="muted">No products yet.</p>}
    </>
  );
}
