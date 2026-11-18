"use client";
import { useApi, when } from "@/components/api";

const LABEL: Record<string, string> = { login: "Signed in", "password.change": "Changed their password", "settings.save": "Saved settings", "bot.settings": "Changed bot settings", "alerts.save": "Changed alerts", "setup.answers": "Saved setup answers", "stay.manual": "Recorded a booking", export: "Exported data", "backup.download": "Downloaded a backup", "reset.test-data": "Cleared test data", "request.approve": "Approved a request", "request.decline": "Declined a request", "request.done": "Closed a request", "contact.delete": "Deleted a guest", "team.add": "Added a teammate", "team.remove": "Removed a teammate", "team.reset-password": "Reset a teammate's password", "apikey.create": "Created an API key", "apikey.revoke": "Revoked an API key", "kb.remove": "Removed knowledge" };

export default function Activity() {
  const { data } = useApi<any[]>("/api/activity", 15000);
  return (
    <>
      <div className="page-head"><div><h1>Activity log</h1><p className="muted" style={{ margin: 0 }}>Who changed what, most recent first. Useful when something looks different and you need to know why.</p></div></div>
      <div className="card" style={{ padding: 0, maxWidth: 900 }}><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
        <tbody>{data?.map((a) => <tr key={a.id}><td className="muted small" style={{ whiteSpace: "nowrap" }}>{when(a.created_at)}</td><td>{a.user_name}</td><td>{LABEL[a.action] ?? a.action}</td><td className="muted small">{a.detail}</td></tr>)}</tbody></table>
        {data?.length === 0 && <p className="muted" style={{ padding: 16 }}>Nothing recorded yet.</p>}</div>
    </>
  );
}
