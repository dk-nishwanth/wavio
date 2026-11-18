import { all, get, id, now, run } from "./db";

const STOP = new Set("a an the is are was were be to of and or in on at for with do does can i you we it this that what how when where which who please my your our me tell about there any have has get got want need would like hi hello ok yes no".split(" "));
export const keyOf = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 160);

/** Remember a guest message the bot couldn't answer, so an admin can teach it the answer once. */
export function recordMiss(ws: string, text: string) {
  const norm = keyOf(text);
  if (norm.length < 4 || norm.split(" ").every((w) => STOP.has(w))) return;
  const row = get<any>("SELECT id, status FROM bot_misses WHERE workspace_id=? AND norm=?", ws, norm);
  if (row) run("UPDATE bot_misses SET count=count+1, last_at=?, status=CASE WHEN status='dismissed' THEN 'dismissed' ELSE 'open' END WHERE id=?", now(), row.id);
  else run("INSERT INTO bot_misses (id, workspace_id, text, norm, count, last_at) VALUES (?,?,?,?,?,?)", id("ms_"), ws, text.slice(0, 300), norm, 1, now());
}

export const listMisses = (ws: string, status = "open") => all<any>("SELECT * FROM bot_misses WHERE workspace_id=? AND status=? ORDER BY count DESC, last_at DESC LIMIT 100", ws, status);

/** Suggested trigger words for turning a missed question into an FAQ. */
export const suggestKeywords = (text: string) => [...new Set(keyOf(text).split(" ").filter((w) => w.length > 2 && !STOP.has(w)))].slice(0, 4).join(", ");

export function resolveMiss(ws: string, missId: string, status: "resolved" | "dismissed" = "resolved") {
  run("UPDATE bot_misses SET status=? WHERE id=? AND workspace_id=?", status, missId, ws);
}
/** After an FAQ is added, close every open miss it now covers. */
export function resolveCovered(ws: string, keywords: string) {
  const words = keywords.split(",").map((k) => keyOf(k)).filter(Boolean);
  for (const m of all<any>("SELECT id, norm FROM bot_misses WHERE workspace_id=? AND status='open'", ws)) if (words.some((w) => ` ${m.norm} `.includes(` ${w} `))) resolveMiss(ws, m.id);
}
