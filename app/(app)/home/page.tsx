"use client";
import Link from "next/link";
import { useApi, when } from "@/components/api";

const ico = {
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  send: <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>,
  alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
};

function Stat({ icon, label, value }: { icon: keyof typeof ico; label: string; value: number | string }) {
  return (
    <div className="card stat">
      <div className="ico"><svg viewBox="0 0 24 24">{ico[icon]}</svg></div>
      <span className="muted small">{label}</span><b>{value}</b>
    </div>
  );
}

export default function Home() {
  const stats = useApi<any>("/api/stats", 5000);
  const settings = useApi<any>("/api/settings");
  const tpls = useApi<any[]>("/api/templates");
  const autos = useApi<any[]>("/api/automations");
  const convs = useApi<any[]>("/api/conversations?filter=all", 5000);
  const stays = useApi<any[]>("/api/stays", 10000);
  const s = stats.data;
  const steps = [
    { done: settings.data ? !settings.data.mock : false, title: "Connect WhatsApp", body: "Add your Cloud API credentials, or keep using test mode.", href: "/settings" },
    { done: (tpls.data?.length ?? 0) > 0, title: "Create a message template", body: "Templates let you message customers outside the 24-hour window.", href: "/templates" },
    { done: (s?.contacts ?? 0) > 0, title: "Add your contacts", body: "Import a CSV of opted-in customers.", href: "/contacts" },
    { done: (autos.data?.length ?? 0) > 0, title: "Set up automations", body: "Install the resort starter pack, or build your own chatbot flow.", href: "/automations" },
    { done: false, title: "Connect your website", body: "Install the React SDK and send events from your site.", href: "/developers" },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  return (
    <>
      <div className="page-head">
        <div><h1>Welcome back</h1><p className="muted" style={{ margin: 0 }}>Here&apos;s what&apos;s happening on your WhatsApp today.</p></div>
        {settings.data && <span className={"status" + (settings.data.mock ? "" : " live")}><i />{settings.data.mock ? "Test mode" : "WhatsApp connected"}</span>}
      </div>

      <div className="grid mb">
        <Stat icon="users" label="Contacts" value={s?.contacts ?? "–"} />
        <Stat icon="chat" label="Open conversations" value={s?.openConversations ?? "–"} />
        <Stat icon="send" label="Messages sent (7d)" value={s?.sent7d ?? "–"} />
        <Stat icon="alert" label="Failed (7d)" value={s?.failed7d ?? "–"} />
      </div>

      {(stays.data?.length ?? 0) > 0 && (() => {
        const live = (stays.data ?? []).filter((x) => x.status === "upcoming" || x.status === "in_house").sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
        return (
          <div className="card mb">
            <div className="row between"><h2>Upcoming stays</h2><span className="chip">{live.filter((x) => x.days_to_arrival === 0 || x.status === "in_house").length} arriving or in-house today</span></div>
            {live.slice(0, 6).map((x) => (
              <div key={x.booking_id} className="check" style={{ alignItems: "center" }}>
                <span className="avatar">{(x.name || "#").slice(0, 1).toUpperCase()}</span>
                <div className="grow"><b style={{ fontWeight: 500 }}>{x.name || "+" + x.phone}</b><div className="muted small">{x.check_in} → {x.check_out} · {x.guests} guests {x.room && `· ${x.room}`}</div></div>
                <span className={"pill " + (x.status === "in_house" ? "ok" : x.days_to_arrival <= 2 ? "warn" : "")}>{x.status === "in_house" ? "In house" : x.days_to_arrival === 0 ? "Arriving today" : `In ${x.days_to_arrival} days`}</span>
              </div>))}
            {live.length === 0 && <p className="muted">No upcoming stays.</p>}
          </div>
        );
      })()}

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)" }}>
        <div className="card">
          <div className="row between"><h2>Get started</h2><span className="chip">{doneCount} of {steps.length} done</span></div>
          <div className="bar mb"><i style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
          {steps.map((x, i) => (
            <Link key={x.title} href={x.href} className="check">
              <span className={"tick" + (x.done ? " done" : "")}>{x.done ? "✓" : <span className="small muted">{i + 1}</span>}</span>
              <div><b style={{ fontWeight: 500 }}>{x.title}</b><div className="muted small">{x.body}</div></div>
            </Link>
          ))}
        </div>
        <div className="card">
          <div className="row between"><h2>Recent conversations</h2><Link className="small muted" href="/inbox">View all</Link></div>
          {(convs.data ?? []).slice(0, 6).map((c) => (
            <Link key={c.id} href="/inbox" className="check" style={{ alignItems: "center" }}>
              <span className="avatar">{(c.name || "#").slice(0, 1).toUpperCase()}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row between"><b style={{ fontWeight: 500 }}>{c.name || "+" + c.phone}</b><span className="small muted">{when(c.last_message_at)}</span></div>
                <div className="muted small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.last_preview}</div>
              </div>
              {c.unread > 0 && <span className="dot">{c.unread}</span>}
            </Link>
          ))}
          {convs.data?.length === 0 && <p className="muted">No conversations yet.</p>}
        </div>
      </div>
    </>
  );
}
