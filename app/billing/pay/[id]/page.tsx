"use client";
import { use, useEffect, useState } from "react";
import { api } from "@/components/api";

export default function PayInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [i, setI] = useState<any>(null);
  const load = () => api(`/api/billing/pay/${id}`).then(setI);
  useEffect(() => { load(); }, [id]);
  if (!i) return null;
  return (
    <div className="auth-wrap"><div className="card auth">
      <div className="brand"><img src="/logo-mark.svg" alt="" />wavio</div>
      <h2 style={{ textAlign: "center" }}>Invoice {i.number}</h2>
      <p className="muted" style={{ textAlign: "center" }}>{i.plan} plan · {i.period}</p>
      <div className="row between" style={{ fontWeight: 600, fontSize: 20 }}><span>Total (incl. GST)</span><span>₹{i.total.toLocaleString("en-IN")}</span></div>
      {i.status === "paid" ? <><p className="banner ok mt">Paid. Your plan is active.</p><a className="btn" style={{ width: "100%", justifyContent: "center" }} href="/billing">Back to Billing</a></>
        : i.test ? <><button className="btn mt" style={{ width: "100%", justifyContent: "center" }} onClick={async () => { await api(`/api/billing/pay/${id}`, "POST"); load(); }}>Pay (test checkout)</button><p className="muted small" style={{ textAlign: "center" }}>No payment gateway is configured on this server, so this activates the plan without charging.</p></>
        : <p className="muted mt">Use the Razorpay payment link to pay.</p>}
    </div></div>
  );
}
