"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "./api";

const links = [["/inbox", "Inbox"], ["/contacts", "Contacts"], ["/templates", "Templates"], ["/campaigns", "Broadcasts"], ["/automations", "Automations"], ["/developers", "Developers"], ["/settings", "Settings"]];

export default function Nav({ name }: { name: string }) {
  const path = usePathname();
  return (
    <nav className="side">
      <div className="logo">WAConnect</div>
      {links.map(([href, label]) => (
        <Link key={href} href={href} className={path.startsWith(href) ? "on" : ""}>{label}</Link>
      ))}
      <div style={{ flex: 1 }} />
      <div className="small muted" style={{ padding: "0 10px" }}>{name}</div>
      <a style={{ cursor: "pointer" }} onClick={async () => { await api("/api/auth/logout", "POST"); location.href = "/login"; }}>Sign out</a>
    </nav>
  );
}
