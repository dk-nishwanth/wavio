import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { receiveInbound } from "@/lib/core";

/** Simulates an inbound WhatsApp message so you can test the inbox and automations without Meta. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const { phone, name, text } = await req.json();
  receiveInbound(s.workspaceId, { phone, name }, { type: "text", text: text || "Hi" });
  return json({ ok: true });
});
