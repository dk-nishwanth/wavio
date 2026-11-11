import { get, run } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { activeProvider, payCfg } from "@/lib/payments";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const s = await requireSession();
  const w = get<any>("SELECT * FROM workspaces WHERE id=?", s.workspaceId)!;
  const base = process.env.APP_URL || "http://localhost:3000";
  return json({
    name: w.name, phoneNumberId: w.wa_phone_number_id, wabaId: w.wa_waba_id, hasToken: !!w.wa_token, hasAppSecret: !!w.wa_app_secret,
    verifyToken: w.wa_verify_token,
    payments: { provider: activeProvider(s.workspaceId), razorpayKeyId: payCfg(s.workspaceId).razorpay_key_id ?? "", hasRazorpaySecret: !!payCfg(s.workspaceId).razorpay_key_secret, hasRazorpayWebhook: !!payCfg(s.workspaceId).razorpay_webhook_secret, payuKey: payCfg(s.workspaceId).payu_key ?? "", hasPayuSalt: !!payCfg(s.workspaceId).payu_salt, payuMode: payCfg(s.workspaceId).payu_mode ?? "test", razorpayWebhookUrl: `${base}/api/payments/razorpay/webhook/${w.id}` }, webhookUrl: `${base}/api/whatsapp/webhook/${w.id}`, mock: !w.wa_token || !w.wa_phone_number_id,
  });
});

export const PUT = handle(async (req: Request) => {
  const s = await requireSession();
  const b = await req.json();
  run(
    "UPDATE workspaces SET name=COALESCE(?,name), wa_phone_number_id=COALESCE(?,wa_phone_number_id), wa_waba_id=COALESCE(?,wa_waba_id), wa_token=COALESCE(?,wa_token), wa_app_secret=COALESCE(?,wa_app_secret) WHERE id=?",
    b.name || null, b.phoneNumberId || null, b.wabaId || null, b.token || null, b.appSecret || null, s.workspaceId,
  );
  if (b.payments) {
    const cur = payCfg(s.workspaceId) as Record<string, any>;
    const p = b.payments as Record<string, string>;
    for (const k of ["razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret", "payu_key", "payu_salt", "payu_mode"]) if (p[k]) cur[k] = p[k].trim();
    if (p.clear === "razorpay") for (const k of ["razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"]) delete cur[k];
    if (p.clear === "payu") for (const k of ["payu_key", "payu_salt"]) delete cur[k];
    run("UPDATE workspaces SET pay_json=? WHERE id=?", JSON.stringify(cur), s.workspaceId);
  }
  return json({ ok: true });
});
