import { all, id, now, run } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const s = await requireSession();
  return json(all("SELECT * FROM bot_faqs WHERE workspace_id=? ORDER BY created_at DESC", s.workspaceId));
});

/** Teach the bot: when a guest's message contains any of the keywords/phrases, it sends this answer (and optionally a library file). */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  const keywords = String(b.keywords ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean).join(", ");
  if (!keywords || !String(b.answer ?? "").trim()) throw new HttpError(400, "Add at least one keyword and an answer");
  const fid = id("faq_");
  run("INSERT INTO bot_faqs (id, workspace_id, keywords, answer, asset_label, created_at) VALUES (?,?,?,?,?,?)", fid, s.workspaceId, keywords.slice(0, 500), String(b.answer).slice(0, 1500), b.asset_label ? String(b.asset_label).slice(0, 80) : null, now());
  return json({ id: fid });
});
