"use client";
import { useState } from "react";
import { WAConnectProvider, WhatsAppOptIn, ChatButton, useWAConnect } from "../../sdk";

function Shop() {
  const { identity, track, trackCart } = useWAConnect();
  const [log, setLog] = useState<string[]>([]);
  const say = (s: string) => setLog((l) => [s, ...l].slice(0, 8));
  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h2>1. Subscribe (identify + opt-in)</h2>
      <WhatsAppOptIn onDone={(i) => say(`identified ${i.phone}`)} />
      <h2 className="mt">2. Shop events</h2>
      <p className="muted small">{identity ? `Signed in as ${identity.phone}` : "Subscribe first."}</p>
      <div className="row wrap">
        <button className="btn ghost" disabled={!identity} onClick={async () => { await trackCart({ cart_url: location.origin + "/demo?cart=1", total: 1499 }); say("tracked cart_updated"); }}>Add to cart</button>
        <button className="btn" disabled={!identity} onClick={async () => { await track("order_placed", { order_id: "ORD-" + Math.floor(Math.random() * 9000 + 1000), total: 1499 }); say("tracked order_placed"); }}>Place order</button>
      </div>
      <ul className="small muted">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <p><ChatButton businessPhone="919999999999" message="Hi, I have a question about my order">Chat on WhatsApp</ChatButton></p>
    </div>
  );
}

export default function Demo() {
  const [key, setKey] = useState("");
  const [go, setGo] = useState(false);
  return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 16px" }}>
      <h1>Demo storefront</h1>
      <p className="muted">A stand-in React site wired up with the SDK. Paste your <b>public key</b> from Developers, then try the events.</p>
      {!go ? (<div className="row"><input placeholder="pk_live_..." value={key} onChange={(e) => setKey(e.target.value)} /><button className="btn" onClick={() => setGo(true)} disabled={!key.startsWith("pk_")}>Start</button></div>)
        : (<WAConnectProvider publicKey={key}><Shop /></WAConnectProvider>)}
    </div>
  );
}
