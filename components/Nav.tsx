"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

const I = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  inbox: <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>),
  file: (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>),
  send: (<><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>),
  target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>),
  bag: (<><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>),
  receipt: (<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>),
  card: (<><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19" /></>),
  bot: (<><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6" /></>),
  inbox2: <path d="M4 13h4l2 3h4l2-3h4M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />,
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  code: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
  cog: (<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>),
};

const groups: { title: string; links: [string, string, keyof typeof I][] }[] = [
  { title: "Engage", links: [["/home", "Home", "home"], ["/inbox", "Inbox", "inbox"], ["/requests", "Requests", "inbox2"], ["/contacts", "Contacts", "users"], ["/leads", "Leads", "target"]] },
  { title: "Grow", links: [["/concierge", "AI Concierge", "bot"], ["/templates", "Templates", "file"], ["/catalog", "Catalog", "bag"], ["/orders", "Orders", "receipt"], ["/campaigns", "Broadcasts", "send"], ["/automations", "Automations", "zap"]] },
  { title: "Build", links: [["/team", "Team", "users"], ["/billing", "Billing", "card"], ["/developers", "Developers", "code"], ["/settings", "Settings", "cog"]] },
];

export default function Nav({ name, terms, showBilling = false }: { name: string; terms: { catalog: string; orders: string }; showBilling?: boolean }) {
  const label = (l: string) => (l === "Catalog" ? terms.catalog : l === "Orders" ? terms.orders : l);
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  const [reqs, setReqs] = useState(0);
  const [perm, setPerm] = useState<string>("default");
  const prev = useRef<number | null>(null);
  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    let stop = false;
    const tick = async () => {
      try {
        const s = await api<{ unread: number; pendingRequests: number }>("/api/stats");
        if (stop) return;
        setUnread(s.unread); setReqs(s.pendingRequests);
        const total = s.unread + s.pendingRequests;
        document.title = (total > 0 ? `(${total}) ` : "") + "Wavio";
        const now = s.unread + s.pendingRequests;
        if (prev.current !== null && now > prev.current && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          new Notification("New WhatsApp message", { body: `${s.unread} chat${s.unread === 1 ? "" : "s"} waiting, ${s.pendingRequests} request${s.pendingRequests === 1 ? "" : "s"} to review`, icon: "/logo-mark.svg", tag: "wavio-unread" });
        }
        prev.current = now;
      } catch { /* signed out or offline: try again next tick */ }
    };
    tick();
    const t = setInterval(tick, 8000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return (
    <nav className="side">
      <div className="brand"><img src="/logo-mark.svg" alt="" />wavio</div>
      {groups.map((g) => (
        <div key={g.title}>
          <div className="grp">{g.title}</div>
          {g.links.filter(([href]) => showBilling || href !== "/billing").map(([href, l, icon]) => (
            <Link key={href} href={href} className={"nav" + (path.startsWith(href) ? " on" : "")}>
              <svg viewBox="0 0 24 24">{I[icon]}</svg>{label(l)}{href === "/inbox" && unread > 0 && <span className="dot" style={{ marginLeft: "auto" }}>{unread}</span>}{href === "/requests" && reqs > 0 && <span className="dot" style={{ marginLeft: "auto" }}>{reqs}</span>}
            </Link>
          ))}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      {perm === "default" && <button className="btn ghost small" style={{ marginBottom: 8, justifyContent: "center" }} onClick={async () => setPerm(await Notification.requestPermission())}>Turn on desktop alerts</button>}
      <div className="me">
        <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          <a className="small muted" style={{ cursor: "pointer" }} onClick={async () => { await api("/api/auth/logout", "POST"); location.href = "/login"; }}>Sign out</a>
        </div>
      </div>
    </nav>
  );
}
