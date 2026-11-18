import { get, run } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { ensureConversation, receiveInbound, upsertContact } from "@/lib/core";
import { getAgent, runEngine } from "@/lib/ai";
import { hit } from "@/lib/ratelimit";

/** The Test page's pretend guest. Its replies are never sent to WhatsApp — they only appear here — but requests, bookings and notes are created for real so you can try the full approval flow. */
const TEST_PHONE = "10000000001";

export const GET = handle(async () => {
  const s = await requireSession();
  const c = get<any>("SELECT id FROM contacts WHERE workspace_id=? AND phone=?", s.workspaceId, TEST_PHONE);
  const conv = c && get<any>("SELECT id, bot_paused FROM conversations WHERE contact_id=?", c.id);
  const agent = getAgent(s.workspaceId);
  return json({ contactId: c?.id ?? null, conversationId: conv?.id ?? null, paused: !!conv?.bot_paused, botOn: !!(agent.enabled && agent.auto_reply), engine: agent.engine });
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession(); const ws = s.workspaceId;
  if (!hit(`test-chat:${s.userId}`, 120, 3600_000).ok) throw new HttpError(429, "Test limit reached for this hour");
  const text = String((await req.json()).text ?? "").trim().slice(0, 1000);
  if (!text) throw new HttpError(400, "Type a message");
  const agent = getAgent(ws);
  const c = upsertContact(ws, { phone: TEST_PHONE, name: "Test Guest", tags: ["test-guest"], optedIn: true });
  const before = get<any>("SELECT bot_paused FROM conversations WHERE contact_id=?", c.id);
  receiveInbound(ws, { phone: TEST_PHONE, name: "Test Guest" }, { type: "text", text });
  const conv = ensureConversation(ws, c.id);
  await new Promise((r) => setTimeout(r, 80)); // receiveInbound decides asynchronously whether a scripted flow or the bot takes the message
  const job = get<any>("SELECT id FROM jobs WHERE type='ai_reply' AND status='pending' AND payload LIKE ? ORDER BY created_at DESC LIMIT 1", `%${c.id}%`);
  const base = { conversationId: conv.id, contactId: c.id };
  if (!job) return json({ ...base, handledBy: before?.bot_paused ? "paused" : "flow" });
  run("DELETE FROM jobs WHERE id=?", job.id); // answer now instead of after the usual short delay
  if (!agent.enabled || !agent.auto_reply) return json({ ...base, handledBy: "off" });
  if (conv.bot_paused) return json({ ...base, handledBy: "paused" });
  const r = await runEngine(ws, agent, c.id, text);
  return json({ ...base, handledBy: "bot", debug: r.debug ?? null });
});
