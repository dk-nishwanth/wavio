import { all, get, now } from "./db";
import { listStays } from "./stays";
import { stagesFor } from "./industry";

const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);

/** First-reply speed per conversation in the window: the time from the guest's first message to the next reply, split by who replied. */
function responseTimes(ws: string, from: number, to: number) {
  const bot: number[] = [], team: number[] = [];
  const convs = all<any>("SELECT DISTINCT contact_id FROM messages WHERE workspace_id=? AND direction='in' AND created_at>=? AND created_at<? LIMIT 3000", ws, from, to);
  for (const { contact_id } of convs) {
    const first = get<any>("SELECT created_at FROM messages WHERE contact_id=? AND direction='in' AND created_at>=? AND created_at<? ORDER BY created_at LIMIT 1", contact_id, from, to);
    const reply = first && get<any>("SELECT created_at, ai, sent_by FROM messages WHERE contact_id=? AND direction='out' AND is_note=0 AND created_at>=? ORDER BY created_at LIMIT 1", contact_id, first.created_at);
    if (!reply || reply.created_at - first.created_at > 24 * 3600_000) continue; // an unanswered chat isn't a "response time"
    (reply.ai ? bot : reply.sent_by ? team : []).push(reply.created_at - first.created_at);
  }
  return { botAvgMs: avg(bot), botMedianMs: median(bot), teamAvgMs: avg(team), teamMedianMs: median(team), botN: bot.length, teamN: team.length };
}

function window(ws: string, from: number, to: number) {
  const n = (sql: string, ...p: any[]) => (get<any>(sql, ws, from, to, ...p)!.n as number) ?? 0;
  const activeGuests = n("SELECT COUNT(DISTINCT contact_id) n FROM messages WHERE workspace_id=? AND direction='in' AND created_at>=? AND created_at<?");
  const handedOver = new Set(all<any>("SELECT DISTINCT contact_id FROM requests WHERE workspace_id=? AND kind='handoff' AND created_at>=? AND created_at<?", ws, from, to).map((r) => r.contact_id));
  const teamTouched = new Set(all<any>("SELECT DISTINCT contact_id FROM messages WHERE workspace_id=? AND direction='out' AND sent_by IS NOT NULL AND is_note=0 AND created_at>=? AND created_at<?", ws, from, to).map((r) => r.contact_id));
  const botTouched = all<any>("SELECT DISTINCT contact_id FROM messages WHERE workspace_id=? AND direction='out' AND ai=1 AND created_at>=? AND created_at<?", ws, from, to).map((r) => r.contact_id);
  const botAlone = botTouched.filter((c) => !handedOver.has(c) && !teamTouched.has(c)).length;
  const reqDecided = all<any>("SELECT created_at, decided_at, status FROM requests WHERE workspace_id=? AND decided_at IS NOT NULL AND decided_at>=? AND decided_at<? AND created_by='ai'", ws, from, to);
  const ratings = all<any>("SELECT payload FROM events WHERE workspace_id=? AND name='guest_rated' AND created_at>=? AND created_at<?", ws, from, to).map((e) => JSON.parse(e.payload).rating as number);
  const stays = listStays(ws);
  const inWin = (iso: string) => { const t = new Date(iso + "T12:00:00").getTime(); return t >= from && t < to; };
  return {
    newGuests: n("SELECT COUNT(*) n FROM contacts WHERE workspace_id=? AND created_at>=? AND created_at<?"),
    activeGuests, guestMessages: n("SELECT COUNT(*) n FROM messages WHERE workspace_id=? AND direction='in' AND created_at>=? AND created_at<?"),
    botReplies: n("SELECT COUNT(*) n FROM messages WHERE workspace_id=? AND direction='out' AND ai=1 AND created_at>=? AND created_at<?"),
    teamReplies: n("SELECT COUNT(*) n FROM messages WHERE workspace_id=? AND direction='out' AND sent_by IS NOT NULL AND is_note=0 AND created_at>=? AND created_at<?"),
    automated: n("SELECT COUNT(*) n FROM messages WHERE workspace_id=? AND direction='out' AND ai=0 AND sent_by IS NULL AND is_note=0 AND created_at>=? AND created_at<?"),
    botAloneGuests: botAlone, handedToTeam: handedOver.size,
    botAlonePct: botTouched.length ? Math.round((botAlone / botTouched.length) * 100) : null,
    requestsRaised: n("SELECT COUNT(*) n FROM requests WHERE workspace_id=? AND created_at>=? AND created_at<? AND kind!='handoff'"),
    bookingRequests: n("SELECT COUNT(*) n FROM requests WHERE workspace_id=? AND created_at>=? AND created_at<? AND kind='booking'"),
    bookingsApproved: n("SELECT COUNT(*) n FROM requests WHERE workspace_id=? AND kind='booking' AND status IN ('approved','done') AND decided_at>=? AND decided_at<?"),
    approvalMedianMs: median(reqDecided.map((r) => r.decided_at - r.created_at)),
    staysRecorded: stays.filter((s) => s.status !== "cancelled" && inWin(s.check_in_date)).length,
    cancelled: stays.filter((s) => s.status === "cancelled" && inWin(s.check_in_date)).length,
    advancesCollected: n("SELECT COALESCE(SUM(total),0) n FROM orders WHERE workspace_id=? AND status IN ('paid','fulfilled') AND paid_at>=? AND paid_at<?"),
    estimatedBookingValue: all<any>("SELECT details FROM requests WHERE workspace_id=? AND kind='booking' AND status IN ('approved','done') AND decided_at>=? AND decided_at<?", ws, from, to).reduce((a, r) => a + (Number(JSON.parse(r.details).estimate_total) || 0), 0),
    ratingAvg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null, ratingCount: ratings.length,
  };
}

export function buildReport(ws: string, days = 30) {
  const to = now() + 1000, from = to - days * 864e5, prevFrom = from - days * 864e5; // +1s so anything happening this instant is counted
  const hours = Array(24).fill(0), weekdays = Array(7).fill(0);
  for (const m of all<any>("SELECT created_at FROM messages WHERE workspace_id=? AND direction='in' AND created_at>=?", ws, from)) { const d = new Date(m.created_at); hours[d.getHours()]++; weekdays[d.getDay()]++; }
  const requestsByKind = all<any>("SELECT kind, status, COUNT(*) n FROM requests WHERE workspace_id=? AND created_at>=? GROUP BY kind, status", ws, from);
  const leads = all<any>("SELECT stage, COUNT(*) n FROM leads WHERE workspace_id=? GROUP BY stage", ws);
  const labels = Object.fromEntries(stagesFor(ws).map((s) => [s.key, s.label]));
  return {
    days, current: window(ws, from, to), previous: window(ws, prevFrom, from), responseTimes: responseTimes(ws, from, to),
    requestsByKind, pipeline: stagesFor(ws).map((s) => ({ stage: s.label, n: leads.find((l) => l.stage === s.key)?.n ?? 0 })), stageLabels: labels,
    topAnswers: all<any>("SELECT keywords, hits FROM bot_faqs WHERE workspace_id=? AND hits>0 ORDER BY hits DESC LIMIT 6", ws),
    unanswered: all<any>("SELECT text, count FROM bot_misses WHERE workspace_id=? AND status='open' ORDER BY count DESC LIMIT 6", ws),
    hours, weekdays,
  };
}
