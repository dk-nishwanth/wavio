import { get } from "./db";
import { decrypt } from "./crypto";
import { metaCfg } from "./metaleads";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, any> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export type Tool = { name: string; description: string; input_schema: Record<string, any> };
export type ModelResult = { blocks: Block[]; stop: string; inputTokens: number; outputTokens: number };

export const DEFAULT_MODEL = "claude-sonnet-5-5";

/** API key: the workspace's own key (saved in Settings, encrypted) or the server's ANTHROPIC_API_KEY. */
export function aiKey(ws: string): string | null {
  return (metaCfg(ws) as any).ai_key ? decrypt((metaCfg(ws) as any).ai_key) : process.env.ANTHROPIC_API_KEY || null;
}
export const aiConfigured = (ws: string) => !!aiKey(ws);

export class LlmError extends Error {}

/** One call to the Anthropic Messages API. The agent loop in ai.ts decides what to do with tool calls. */
export async function callModel(ws: string, o: { system: string; messages: Msg[]; tools: Tool[]; model?: string; temperature?: number; maxTokens?: number }): Promise<ModelResult> {
  const key = aiKey(ws);
  if (!key) throw new LlmError("The AI concierge isn't connected — add an Anthropic API key in Settings.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: o.model || process.env.AI_MODEL || DEFAULT_MODEL, max_tokens: o.maxTokens ?? 1024, temperature: o.temperature ?? 0.3,
      system: o.system, messages: o.messages, ...(o.tools.length ? { tools: o.tools } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new LlmError(d?.error?.message || `AI service error ${res.status}`);
  return { blocks: d.content ?? [], stop: d.stop_reason ?? "end_turn", inputTokens: d.usage?.input_tokens ?? 0, outputTokens: d.usage?.output_tokens ?? 0 };
}

void get;
