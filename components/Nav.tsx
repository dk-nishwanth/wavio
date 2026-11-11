"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "./api";

const I = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  inbox: <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>),
  file: (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>),
  send: (<><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>),
  target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>),
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  code: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
  cog: (<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>),
};

const groups: { title: string; links: [string, string, keyof typeof I][] }[] = [
  { title: "Engage", links: [["/home", "Home", "home"], ["/inbox", "Inbox", "inbox"], ["/contacts", "Contacts", "users"], ["/leads", "Leads", "target"]] },
  { title: "Grow", links: [["/templates", "Templates", "file"], ["/campaigns", "Broadcasts", "send"], ["/automations", "Automations", "zap"]] },
  { title: "Build", links: [["/developers", "Developers", "code"], ["/settings", "Settings", "cog"]] },
];

export default function Nav({ name }: { name: string }) {
  const path = usePathname();
  return (
    <nav className="side">
      <div className="brand"><img src="/logo-mark.svg" alt="" />wavio</div>
      {groups.map((g) => (
        <div key={g.title}>
          <div className="grp">{g.title}</div>
          {g.links.map(([href, label, icon]) => (
            <Link key={href} href={href} className={"nav" + (path.startsWith(href) ? " on" : "")}>
              <svg viewBox="0 0 24 24">{I[icon]}</svg>{label}
            </Link>
          ))}
        </div>
      ))}
      <div style={{ flex: 1 }} />
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
