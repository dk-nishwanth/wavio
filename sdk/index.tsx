"use client";
/**
 * WAConnect React SDK.  Copy this file into your site (or publish it as an npm package).
 *
 *   <WAConnectProvider publicKey="pk_live_..." baseUrl="https://your-waconnect.com">
 *     <App />
 *   </WAConnectProvider>
 *
 *   const { identify, track } = useWAConnect();
 *   identify({ phone: "919876543210", name: "Asha", optIn: true });
 *   track("order_placed", { order_id: "1042", total: 1499 });
 *
 * Use the PUBLIC key in the browser only. Anything involving money should be sent from your backend with the SECRET key.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Identity = { phone: string; name?: string; email?: string; optIn?: boolean; attributes?: Record<string, unknown>; tags?: string[] };
type Ctx = {
  identify: (i: Identity) => Promise<void>;
  track: (event: string, properties?: Record<string, unknown>, opts?: { idempotencyKey?: string }) => Promise<void>;
  /** Tracks cart_updated; the "abandoned cart" automation waits and cancels itself if order_placed arrives. */
  trackCart: (cart: { cart_url?: string; items?: unknown[]; total?: number }) => Promise<void>;
  identity: Identity | null;
};

const C = createContext<Ctx | null>(null);
const STORE = "waconnect_identity";

export function WAConnectProvider({ publicKey, baseUrl = "", children }: { publicKey: string; baseUrl?: string; children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const idRef = useRef<Identity | null>(null);
  idRef.current = identity;

  useEffect(() => {
    try { const s = localStorage.getItem(STORE); if (s) setIdentity(JSON.parse(s)); } catch {}
  }, []);

  const post = useCallback(async (path: string, body: unknown) => {
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicKey}` }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `WAConnect error ${res.status}`);
  }, [baseUrl, publicKey]);

  const value = useMemo<Ctx>(() => ({
    identity,
    async identify(i) {
      await post("/contacts", i);
      setIdentity(i); idRef.current = i;
      try { localStorage.setItem(STORE, JSON.stringify(i)); } catch {}
    },
    async track(event, properties, opts) {
      const who = idRef.current;
      if (!who) throw new Error("Call identify() before track()");
      await post("/events", { event, phone: who.phone, properties, idempotencyKey: opts?.idempotencyKey });
    },
    async trackCart(cart) {
      const who = idRef.current;
      if (who) await post("/events", { event: "cart_updated", phone: who.phone, properties: cart });
    },
  }), [identity, post]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useWAConnect() {
  const v = useContext(C);
  if (!v) throw new Error("useWAConnect must be used inside <WAConnectProvider>");
  return v;
}

/** Consent checkbox + phone field. Only opts the person in when they tick the box. */
export function WhatsAppOptIn({ label = "Send me order updates on WhatsApp", onDone }: { label?: string; onDone?: (i: Identity) => void }) {
  const { identify } = useWAConnect();
  const [phone, setPhone] = useState(""); const [name, setName] = useState(""); const [ok, setOk] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setState("saving");
      try { const i = { phone, name: name || undefined, optIn: ok }; await identify(i); setState("done"); onDone?.(i); } catch { setState("error"); }
    }}>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="WhatsApp number" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      <label><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> {label}</label>
      <button disabled={!ok || state === "saving"}>{state === "done" ? "Saved ✓" : "Subscribe"}</button>
      {state === "error" && <p role="alert">Something went wrong. Please try again.</p>}
    </form>
  );
}

/** Opens wa.me with a prefilled message — a click-to-chat button for your business number. */
export function ChatButton({ businessPhone, message = "Hi!", children = "Chat on WhatsApp" }: { businessPhone: string; message?: string; children?: React.ReactNode }) {
  const href = `https://wa.me/${businessPhone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}
