import { requireSession, HttpError } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { runConcierge } from "@/lib/ai";
import { LlmError } from "@/lib/llm";
import { hit } from "@/lib/ratelimit";

/** Try the concierge without sending anything to a guest or saving anything: returns its reply and the actions it would take. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  if (!hit(`ai-playground:${s.userId}`, 40, 3600_000).ok) throw new HttpError(429, "Playground limit reached for this hour");
  const b = await req.json();
  const transcript = (Array.isArray(b.transcript) ? b.transcript : []).slice(-20).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", text: String(m.text ?? "").slice(0, 1500) }));
  try {
    return json(await runConcierge(s.workspaceId, b.contactId ?? null, { dry: true, transcript }));
  } catch (e: any) {
    if (e instanceof LlmError) throw new HttpError(400, e.message);
    throw e;
  }
});
