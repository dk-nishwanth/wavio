import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { checkConnection, sendTemplate, waConfig } from "@/lib/wa";
import { metaCfg } from "@/lib/metaleads";

/** Settings → "Test connection": checks the credentials with Meta and optionally sends Meta's built-in hello_world template. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const { to } = await req.json().catch(() => ({}));
  const cfg = waConfig(s.workspaceId);
  const out: Record<string, unknown> = { webhookLastSeen: metaCfg(s.workspaceId).last_webhook_at ?? null };
  try {
    out.connection = await checkConnection(cfg);
  } catch (e: any) {
    return json({ ...out, ok: false, error: e.message }, 200);
  }
  if (to) {
    try {
      out.messageId = await sendTemplate(cfg, String(to), "hello_world", "en_US", []);
    } catch (e: any) {
      return json({ ...out, ok: false, error: `Connected, but sending failed: ${e.message}` }, 200);
    }
  }
  return json({ ...out, ok: true });
});
