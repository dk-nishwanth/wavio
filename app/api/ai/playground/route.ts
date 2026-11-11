import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { getAgent, runConcierge } from "@/lib/ai";
import { handleGuest } from "@/lib/hotelbot";
import { aiConfigured } from "@/lib/llm";
import { LlmError } from "@/lib/llm";
import { hit } from "@/lib/ratelimit";

/** Try the concierge without sending anything to a guest or saving anything: returns its reply and the actions it would take. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  if (!hit(`ai-playground:${s.userId}`, 40, 3600_000).ok) throw new HttpError(429, "Playground limit reached for this hour");
  const b = await req.json();
  const transcript = (Array.isArray(b.transcript) ? b.transcript : []).slice(-20).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", text: String(m.text ?? "").slice(0, 1500) }));
  const engine = getAgent(s.workspaceId).engine;
  try {
    if (engine === "rules" || (engine === "hybrid" && !aiConfigured(s.workspaceId))) {
      // the hotel bot keeps its place in the conversation in `state`, which the page sends back each turn
      const last = transcript.filter((m: any) => m.role === "user").pop();
      const r = await handleGuest(s.workspaceId, null, last?.text ?? "", { dry: true, state: b.state });
      return json({ reply: r.replies.join("\n\n") || null, replies: r.replies, steps: r.steps, state: r.state, engine: "rules", inputTokens: 0, outputTokens: 0, escalated: r.handoff });
    }
    return json({ ...(await runConcierge(s.workspaceId, b.contactId ?? null, { dry: true, transcript })), engine: "ai" });
  } catch (e: any) {
    if (e instanceof LlmError) throw new HttpError(400, e.message);
    throw e;
  }
});
