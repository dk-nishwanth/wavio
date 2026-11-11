"use client";
import { use } from "react";
import { useApi, when } from "@/components/api";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: i } = useApi<any>(`/api/invoices/${id}`);
  if (!i) return null;
  const half = i.gst / 2;
  return (
    <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 16px" }}>
      <div className="row between mb" id="noprint"><a href="/billing" className="btn ghost">← Billing</a><button className="btn" onClick={() => window.print()}>Print / save as PDF</button></div>
      <div className="card" style={{ padding: 32 }}>
        <div className="row between"><div className="brand" style={{ padding: 0 }}><img src="/logo-mark.svg" alt="" />wavio</div><div style={{ textAlign: "right" }}><h1 style={{ fontSize: 22 }}>TAX INVOICE</h1><div className="muted small">{i.number} · {when(i.created_at)}</div></div></div>
        <div className="grid mt" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><b>{i.seller.name}</b><div className="muted small">{i.seller.address}<br />{i.seller.gstin && `GSTIN: ${i.seller.gstin}`}</div></div>
          <div><span className="muted small">Billed to</span><br /><b>{i.buyer.company || "—"}</b><div className="muted small">{i.buyer.address}<br />{i.buyer.gstin && `GSTIN: ${i.buyer.gstin}`}</div></div>
        </div>
        <table className="mt"><thead><tr><th>Description</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead><tbody>
          <tr><td>Wavio {i.plan} plan — {i.period}{i.extra_seats ? ` + ${i.extra_seats} extra user(s)` : ""}<div className="muted small">SAC 998314</div></td><td style={{ textAlign: "right" }}>{inr(i.base)}</td></tr>
          {i.intra ? <><tr><td>CGST @ 9%</td><td style={{ textAlign: "right" }}>{inr(half)}</td></tr><tr><td>SGST @ 9%</td><td style={{ textAlign: "right" }}>{inr(half)}</td></tr></> : <tr><td>IGST @ 18%</td><td style={{ textAlign: "right" }}>{inr(i.gst)}</td></tr>}
          <tr><td><b>Total</b></td><td style={{ textAlign: "right" }}><b>{inr(i.total)}</b></td></tr></tbody></table>
        <p className="muted small mt">Status: {i.status}{i.paid_at ? ` on ${when(i.paid_at)}` : ""}. WhatsApp conversation charges are billed separately by Meta.</p>
      </div>
      <style>{`@media print{body{background:#fff}#noprint{display:none}.card{border:0;box-shadow:none}}`}</style>
    </div>
  );
}
