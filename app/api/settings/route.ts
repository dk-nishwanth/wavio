import { get, run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const s = await requireSession();
  const w = get<any>("SELECT * FROM workspaces WHERE id=?", s.workspaceId)!;
  const base = process.env.APP_URL || "http://localhost:3000";
  return json({
    name: w.name, phoneNumberId: w.wa_phone_number_id, wabaId: w.wa_waba_id, hasToken: !!w.wa_token, hasAppSecret: !!w.wa_app_secret,
    verifyToken: w.wa_verify_token, webhookUrl: `${base}/api/whatsapp/webhook/${w.id}`, mock: !w.wa_token || !w.wa_phone_number_id,
  });
});

export const PUT = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  run(
    "UPDATE workspaces SET name=COALESCE(?,name), wa_phone_number_id=COALESCE(?,wa_phone_number_id), wa_waba_id=COALESCE(?,wa_waba_id), wa_token=COALESCE(?,wa_token), wa_app_secret=COALESCE(?,wa_app_secret) WHERE id=?",
    b.name || null, b.phoneNumberId || null, b.wabaId || null, b.token || null, b.appSecret || null, s.workspaceId,
  );
  return json({ ok: true });
});
