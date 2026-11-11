import dns from "node:dns/promises";
import net from "node:net";
import { all, get, id, now, run } from "./db";
import { HttpError } from "./auth";

const MAX_CHARS = 400_000;
const MAX_SOURCES = 200;

/** Splits text into ~800-character chunks on paragraph/sentence boundaries, with a little overlap so answers aren't cut in half. */
export function chunkText(text: string, size = 800, overlap = 100): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let cur = "";
  const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };
  for (const p of paras) {
    if (p.length > size) {
      push();
      for (const sent of p.split(/(?<=[.!?])\s+/)) {
        if ((cur + " " + sent).length > size) { push(); cur = chunks.length ? chunks[chunks.length - 1].slice(-overlap) + " " + sent : sent; } else cur += (cur ? " " : "") + sent;
      }
      push();
    } else if ((cur + "\n\n" + p).length > size) { const tail = cur.slice(-overlap); push(); cur = tail ? tail + "\n\n" + p : p; }
    else cur += (cur ? "\n\n" : "") + p;
  }
  push();
  return chunks;
}

export function addText(ws: string, title: string, text: string, kind = "text", origin?: string): string {
  if ((get<any>("SELECT COUNT(*) n FROM kb_sources WHERE workspace_id=?", ws)!.n as number) >= MAX_SOURCES) throw new HttpError(400, "Knowledge base is full (200 sources)");
  const body = text.slice(0, MAX_CHARS);
  const chunks = chunkText(body);
  if (!chunks.length) throw new HttpError(400, "No readable text found");
  const sid = id("kb_");
  run("INSERT INTO kb_sources (id, workspace_id, kind, title, origin, status, chars, created_at) VALUES (?,?,?,?,?,?,?,?)", sid, ws, kind, title.slice(0, 120) || "Untitled", origin ?? null, "ready", body.length, now());
  chunks.forEach((t, i) => {
    const cid = id("kc_");
    run("INSERT INTO kb_chunks (id, workspace_id, source_id, ord, text) VALUES (?,?,?,?,?)", cid, ws, sid, i, t);
    run("INSERT INTO kb_fts (text, chunk_id, workspace_id) VALUES (?,?,?)", t, cid, ws);
  });
  return sid;
}

export function deleteSource(ws: string, sourceId: string) {
  for (const c of all<any>("SELECT id FROM kb_chunks WHERE source_id=? AND workspace_id=?", sourceId, ws)) run("DELETE FROM kb_fts WHERE chunk_id=?", c.id);
  run("DELETE FROM kb_chunks WHERE source_id=? AND workspace_id=?", sourceId, ws);
  run("DELETE FROM kb_sources WHERE id=? AND workspace_id=?", sourceId, ws);
}

const STOP = new Set("a an the is are was were be to of and or in on at for with do does can i you we it this that what how when where which who please my your our me tell about there any have has".split(" "));

/** Keyword search (BM25) over the workspace's knowledge. Returns the best passages with their source titles. */
export function searchKb(ws: string, query: string, limit = 6): { text: string; source: string; score: number }[] {
  const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])].filter((w) => !STOP.has(w)).slice(0, 12);
  if (!terms.length) return [];
  const match = terms.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
  const rows = all<any>(
    `SELECT f.chunk_id, bm25(kb_fts) AS score FROM kb_fts f WHERE kb_fts MATCH ? AND f.workspace_id = ? ORDER BY score LIMIT ?`, match, ws, limit);
  return rows.map((r) => {
    const c = get<any>("SELECT c.text, s.title FROM kb_chunks c JOIN kb_sources s ON s.id=c.source_id WHERE c.id=?", r.chunk_id);
    return c ? { text: c.text, source: c.title, score: r.score } : null;
  }).filter(Boolean) as any;
}

// ---- reading a web page safely ----
const privateIp = (ip: string) => {
  if (net.isIPv6(ip)) return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80") || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:10.") || ip.startsWith("::ffff:192.168.");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
};

/** Blocks URLs that point inside your network (SSRF): private ranges, localhost, cloud metadata. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new HttpError(400, "That doesn't look like a valid link"); }
  if (!["http:", "https:"].includes(u.protocol)) throw new HttpError(400, "Only http(s) links are allowed");
  if (u.username || u.password) throw new HttpError(400, "Links with credentials aren't allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => { throw new HttpError(400, "Couldn't find that website"); })).map((a) => a.address);
  if (!ips.length || ips.some(privateIp)) throw new HttpError(400, "That address isn't a public website");
  return u;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;/g, "’")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

export async function fetchPage(raw: string): Promise<{ title: string; text: string }> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "WavioBot/1.0 (knowledge base import)" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString()); continue; }
    if (!res.ok) throw new HttpError(400, `The website answered ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/|html|json|xml/.test(type)) throw new HttpError(400, "That link isn't a web page (upload files instead)");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 3 * 1024 * 1024) throw new HttpError(400, "That page is too large");
    const body = buf.toString("utf8");
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || url.hostname;
    return { title, text: /html/.test(type) ? htmlToText(body) : body };
  }
  throw new HttpError(400, "Too many redirects");
}

export async function fileToText(name: string, mime: string, bytes: Buffer): Promise<string> {
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (/^text\/|json|csv|markdown/.test(mime) || /\.(txt|md|csv|json)$/i.test(name)) return bytes.toString("utf8");
  if (/html/.test(mime) || /\.html?$/i.test(name)) return htmlToText(bytes.toString("utf8"));
  throw new HttpError(400, "Upload a PDF, text, Markdown, CSV or HTML file");
}
