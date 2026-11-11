"use client";
import { use, useEffect, useRef, useState } from "react";
import { api } from "@/components/api";

export default function Pay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [o, setO] = useState<any>(null); const [err, setErr] = useState(""); const form = useRef<HTMLFormElement>(null);
  const [payu, setPayu] = useState<any>(null);
  const load = () => api(`/api/pay/${id}`).then(setO).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  useEffect(() => { if (payu) form.current?.submit(); }, [payu]);
  if (err) return <div className="auth-wrap"><div className="card auth">{err}</div></div>;
  if (!o) return null;
  return (
    <div className="auth-wrap"><div className="card auth">
      <div className="brand"><img src="/logo-mark.svg" alt="" />{o.shop}</div>
      <h2 style={{ textAlign: "center" }}>Order #{o.number}</h2>
      {o.items.map((i: any, k: number) => <div key={k} className="row between small" style={{ padding: "4px 0" }}><span>{i.name} × {i.qty}</span><span>₹{(i.price * i.qty).toLocaleString("en-IN")}</span></div>)}
      <div className="row between mt" style={{ fontWeight: 600, fontSize: 18 }}><span>Total</span><span>₹{o.total.toLocaleString("en-IN")}</span></div>
      {o.status === "paid" || o.status === "fulfilled" ? <p className="banner ok mt" style={{ textAlign: "center" }}>Payment received. Thank you!</p> : o.status === "cancelled" ? <p className="banner mt">This order was cancelled.</p> : (<>
        {o.provider === "test" && <><button className="btn mt" style={{ width: "100%", justifyContent: "center" }} onClick={async () => { await api(`/api/pay/${id}/mock`, "POST"); load(); }}>Pay ₹{o.total} (test checkout)</button><p className="muted small" style={{ textAlign: "center" }}>No payment gateway is connected, so this is a test payment.</p></>}
        {o.provider === "payu" && <button className="btn mt" style={{ width: "100%", justifyContent: "center" }} onClick={async () => setPayu(await api(`/api/pay/${id}/payu`))}>Pay with PayU</button>}
        {o.provider === "razorpay" && <p className="muted small mt">Use the payment link we sent in WhatsApp to pay with Razorpay.</p>}
      </>)}
      {payu && <form ref={form} method="POST" action={payu.action}>{Object.entries(payu.fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v as string} />)}</form>}
    </div></div>
  );
}
