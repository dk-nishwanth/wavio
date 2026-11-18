import nodemailer from "nodemailer";
import { all, get, now } from "./db";
import { metaCfg, saveMetaCfg } from "./metaleads";
import { enqueue } from "./queue";
import { isoToday, pretty } from "./dates";
import { listStays } from "./stays";
import { getBusiness } from "./industry";

export type AlertCfg = {
  email?: { host: string; port: number; secure?: boolean; user?: string; pass?: string; from: string; to: string[] };
  telegram?: { bot_token: string; chat_id: string };
  on?: { requests?: boolean; handoffs?: boolean; digest?: boolean };
  digest_hour?: number; last_digest?: string;
};
export const alertCfg = (ws: string): AlertCfg => ((metaCfg(ws) as any).alerts ?? {}) as AlertCfg;
export const saveAlertCfg = (ws: string, a: AlertCfg) => saveMetaCfg(ws, { ...(metaCfg(ws) as any), alerts: a });

export type Alert = { title: string; body: string };

/** Sends to every configured channel. One channel failing never blocks the others; the failures are returned. */
export async function sendAlert(ws: string, a: Alert): Promise<{ channel: string; ok: boolean; error?: string }[]> {
  const cfg = alertCfg(ws), results: { channel: string; ok: boolean; error?: string }[] = [];
  if (cfg.email?.host && cfg.email.to?.length) {
    try {
      const t = nodemailer.createTransport({ host: cfg.email.host, port: cfg.email.port, secure: !!cfg.email.secure, ignoreTLS: !cfg.email.secure && cfg.email.port !== 587, ...(cfg.email.user ? { auth: { user: cfg.email.user, pass: cfg.email.pass ?? "" } } : {}), connectionTimeout: 10_000, socketTimeout: 15_000 });
      await t.sendMail({ from: cfg.email.from, to: cfg.email.to.join(", "), subject: a.title, text: a.body });
      results.push({ channel: "email", ok: true });
    } catch (e: any) { results.push({ channel: "email", ok: false, error: String(e.message).slice(0, 200) }); }
  }
  if (cfg.telegram?.bot_token && cfg.telegram.chat_id) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${cfg.telegram.bot_token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: cfg.telegram.chat_id, text: `${a.title}\n\n${a.body}`.slice(0, 4000) }), signal: AbortSignal.timeout(10_000) });
      const d: any = await r.json().catch(() => ({}));
      results.push(r.ok && d.ok !== false ? { channel: "telegram", ok: true } : { channel: "telegram", ok: false, error: d.description ?? `HTTP ${r.status}` });
    } catch (e: any) { results.push({ channel: "telegram", ok: false, error: String(e.message).slice(0, 200) }); }
  }
  return results;
}

/** Called when something needs a person (new request, handoff, complaint). Delivery happens in the job loop so a slow mail server never slows a chat. */
export function notifyAdmins(ws: string, kind: "request" | "handoff", a: Alert) {
  const on = alertCfg(ws).on ?? {};
  if (kind === "handoff" ? on.handoffs === false : on.requests === false) return;
  const cfg = alertCfg(ws);
  if (!(cfg.email?.host && cfg.email.to?.length) && !(cfg.telegram?.bot_token && cfg.telegram.chat_id)) return;
  enqueue("alert", { workspaceId: ws, ...a }, { workspaceId: ws });
}

/** The morning summary: who is arriving, what needs a decision, what is waiting for a reply. */
export function buildDigest(ws: string): Alert {
  const today = isoToday(), b = getBusiness(ws);
  const stays = listStays(ws).filter((s) => s.status === "upcoming" || s.status === "in_house");
  const line = (s: any) => `  • ${s.name || "+" + s.phone} — ${s.room || "room not assigned"}, ${s.guests} guests (${s.booking_id})`;
  const arriving = stays.filter((s) => s.check_in_date === today), leaving = stays.filter((s) => s.check_out_date === today), inhouse = stays.filter((s) => s.status === "in_house");
  const open = all<any>("SELECT kind, summary FROM requests WHERE workspace_id=? AND status='open' ORDER BY created_at LIMIT 10", ws);
  const waiting = get<any>("SELECT COUNT(*) n FROM conversations WHERE workspace_id=? AND unread>0", ws)!.n as number;
  const misses = get<any>("SELECT COUNT(*) n FROM bot_misses WHERE workspace_id=? AND status='open'", ws)!.n as number;
  const sect = (t: string, rows: string[]) => (rows.length ? `${t}\n${rows.join("\n")}` : `${t}: none`);
  return {
    title: `${b.name || "Resort"} — morning summary, ${pretty(today)}`,
    body: [sect(`Arriving today (${arriving.length})`, arriving.map(line)), sect(`Leaving today (${leaving.length})`, leaving.map(line)), `In the house: ${inhouse.length}`,
      sect(`Waiting for your decision (${open.length})`, open.map((r) => `  • [${r.kind}] ${r.summary}`)), `Chats waiting for a reply: ${waiting}`, misses ? `Questions the bot couldn't answer: ${misses} (teach it in Guest Bot → Hotel bot)` : ""].filter(Boolean).join("\n\n"),
  };
}

/** Once a day, at the chosen hour (default 8 AM server time). Safe to call every minute. */
export async function maybeSendDigest(ws: string, at = new Date()) {
  const cfg = alertCfg(ws);
  if (cfg.on?.digest === false || at.getHours() < (cfg.digest_hour ?? 8)) return false;
  const day = isoToday();
  if (cfg.last_digest === day) return false;
  saveAlertCfg(ws, { ...cfg, last_digest: day }); // mark first so a failure never causes a flood of retries
  const r = await sendAlert(ws, buildDigest(ws));
  return r.some((x) => x.ok);
}
void now;
