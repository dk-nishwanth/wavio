import { get, now, run } from "./db";

/** Fixed-window counter shared by every process (stored in the DB). Returns false once the limit is exceeded. */
export function hit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const t = now();
  const row = get<any>("SELECT count, reset_at FROM rate_limits WHERE key=?", key);
  if (!row || row.reset_at <= t) {
    run("INSERT INTO rate_limits (key, count, reset_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count, reset_at=excluded.reset_at", key, 1, t + windowMs);
    return { ok: true, retryAfter: 0 };
  }
  run("UPDATE rate_limits SET count=count+1 WHERE key=?", key);
  return row.count + 1 > limit ? { ok: false, retryAfter: Math.ceil((row.reset_at - t) / 1000) } : { ok: true, retryAfter: 0 };
}

export function isBlocked(key: string, limit: number): boolean {
  const row = get<any>("SELECT count, reset_at FROM rate_limits WHERE key=?", key);
  return !!row && row.reset_at > now() && row.count >= limit;
}
export const clear = (key: string) => run("DELETE FROM rate_limits WHERE key=?", key);

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";

export function purgeExpired() { run("DELETE FROM rate_limits WHERE reset_at < ?", now()); }
