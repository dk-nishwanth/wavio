import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { alertCfg, saveAlertCfg } from "@/lib/alerts";
import { audit } from "@/lib/audit";

const mask = (c: any) => ({ email: c.email ? { ...c.email, pass: undefined, hasPass: !!c.email.pass } : null, telegram: c.telegram ? { chat_id: c.telegram.chat_id, hasToken: true } : null, on: c.on ?? {}, digest_hour: c.digest_hour ?? 8 });

export const GET = handle(async () => json(mask(alertCfg((await requireSession()).workspaceId))));

/** Body: { email?: {host,port,secure,user,pass,from,to}, telegram?: {bot_token,chat_id}, on?, digest_hour?, clear?: "email"|"telegram" } — blank secrets keep what's saved. */
export const PUT = handle(async (req: Request) => {
  const s = await requireSession();
  if (s.role !== "admin") throw new HttpError(403, "Only admins can change alerts");
  const b = await req.json(); const cur = alertCfg(s.workspaceId);
  const next = { ...cur };
  if (b.clear) delete (next as any)[b.clear];
  if (b.email) {
    const to = (Array.isArray(b.email.to) ? b.email.to : String(b.email.to ?? "").split(/[,\s;]+/)).filter((x: string) => /.+@.+\..+/.test(x));
    if (!b.email.host || !to.length || !b.email.from) throw new HttpError(400, "Email needs a server, a from address and at least one recipient");
    next.email = { host: String(b.email.host).trim(), port: Number(b.email.port) || 587, secure: !!b.email.secure, user: b.email.user || undefined, pass: b.email.pass || cur.email?.pass, from: String(b.email.from).trim(), to };
  }
  if (b.telegram) {
    if (!b.telegram.chat_id || !(b.telegram.bot_token || cur.telegram?.bot_token)) throw new HttpError(400, "Telegram needs a bot token and a chat ID");
    next.telegram = { bot_token: b.telegram.bot_token || cur.telegram!.bot_token, chat_id: String(b.telegram.chat_id).trim() };
  }
  if (b.on) next.on = { ...cur.on, ...b.on };
  if (b.digest_hour != null) next.digest_hour = Math.min(23, Math.max(0, Math.floor(Number(b.digest_hour))));
  saveAlertCfg(s.workspaceId, next);
  audit(s, "alerts.save", Object.keys(b).join(", "));
  return json({ ok: true });
});
