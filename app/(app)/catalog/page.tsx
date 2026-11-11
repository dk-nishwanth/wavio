"use client";
import { useState } from "react";
import { api, useApi } from "@/components/api";

export default function Catalog() {
  const { data, reload } = useApi<any[]>("/api/products");
  const [f, setF] = useState({ name: "", price: "", description: "", image_url: "" });
  const [err, setErr] = useState("");
  return (
    <>
      <div className="page-head"><div><h1>Catalog</h1><p className="muted" style={{ margin: 0 }}>Products you can add to orders and send to customers with a payment link.</p></div></div>
      <div className="card mb" style={{ maxWidth: 560 }}>
        <h2>Add product</h2>
        <div className="row"><div className="grow"><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div><div style={{ width: 130 }}><label>Price (₹)</label><input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div></div>
        <label>Description</label><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <label>Image URL (optional)</label><input value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value })} />
        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
        <button className="btn mt" onClick={async () => { try { await api("/api/products", "POST", f); setF({ name: "", price: "", description: "", image_url: "" }); setErr(""); reload(); } catch (e: any) { setErr(e.message); } }}>Add product</button>
      </div>
      <div className="grid">
        {data?.map((p) => (
          <div key={p.id} className="card" style={{ opacity: p.active ? 1 : 0.55 }}>
            {p.image_url && <img src={p.image_url} alt="" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10, marginBottom: 10 }} />}
            <div className="row between"><b style={{ fontWeight: 600 }}>{p.name}</b><b>₹{p.price.toLocaleString("en-IN")}</b></div>
            <p className="muted small" style={{ margin: "4px 0 10px" }}>{p.description}</p>
            <div className="row between"><label className="row small" style={{ margin: 0 }}><input type="checkbox" checked={!!p.active} onChange={async (e) => { await api(`/api/products/${p.id}`, "PATCH", { active: e.target.checked }); reload(); }} /> Active</label>
              <a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { if (confirm("Delete product?")) { await api(`/api/products/${p.id}`, "DELETE"); reload(); } }}>delete</a></div>
          </div>
        ))}
      </div>
      {data?.length === 0 && <p className="muted">No products yet.</p>}
    </>
  );
}
