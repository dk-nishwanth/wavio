import { all, get, id, now, run } from "./db";

export function enqueue(type: string, payload: object, opts: { workspaceId?: string; runAt?: number } = {}) {
  const jid = id("job_");
  run(
    "INSERT INTO jobs (id, workspace_id, type, payload, run_at, created_at) VALUES (?,?,?,?,?,?)",
    jid, opts.workspaceId ?? null, type, JSON.stringify(payload), opts.runAt ?? now(), now(),
  );
  return jid;
}

const MAX_ATTEMPTS = 5;

/** Claims and runs due jobs. Safe to call from a worker loop or a cron-triggered route. */
export async function processDue(limit = 25): Promise<number> {
  const { handlers } = await import("./jobs");
  // recover jobs stuck "running" for over 5 minutes (crashed worker)
  run("UPDATE jobs SET status='pending' WHERE status='running' AND run_at < ?", now() - 5 * 60_000);
  const due = all<any>("SELECT id FROM jobs WHERE status='pending' AND run_at <= ? ORDER BY run_at LIMIT ?", now(), limit);
  let done = 0;
  for (const { id: jid } of due) {
    const claimed = run("UPDATE jobs SET status='running', attempts=attempts+1, run_at=? WHERE id=? AND status='pending'", now(), jid);
    if (!claimed.changes) continue;
    const job = get<any>("SELECT * FROM jobs WHERE id=?", jid)!;
    try {
      const h = handlers[job.type];
      if (!h) throw new Error("No handler for " + job.type);
      await h(JSON.parse(job.payload), job);
      run("UPDATE jobs SET status='done' WHERE id=?", jid);
      done++;
    } catch (e: any) {
      const retry = job.attempts < MAX_ATTEMPTS && !e?.permanent;
      run(
        "UPDATE jobs SET status=?, last_error=?, run_at=? WHERE id=?",
        retry ? "pending" : "failed", String(e?.message ?? e).slice(0, 500),
        now() + Math.min(60_000 * 2 ** job.attempts, 3_600_000), jid,
      );
    }
  }
  return done;
}
