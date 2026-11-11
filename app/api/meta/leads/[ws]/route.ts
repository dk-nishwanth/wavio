import crypto from "node:crypto";
import { get } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { handleLeadgen } from "@/lib/metaleads";

type Ctx = { params: Promise<{ ws: string }> };

// Meta webhook verification (same verify token as the WhatsApp webhook)
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { ws } = await params;
  const w = get<any>("SELECT wa_verify_token FROM workspaces WHERE id=?", ws);
  const u = new URL(req.url);
  if (w && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === w.wa_verify_token) return new Response(u.searchParams.get("hub.challenge") ?? "");
  return json({ error: "Verification failed" }, 403);
});

/** Receives Facebook/Instagram Lead Ads (field "leadgen"). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { ws } = await params;
  const w = get<any>("SELECT * FROM workspaces WHERE id=?", ws);
  if (!w) return json({ error: "Unknown workspace" }, 404);
  const raw = await req.text();
  if (w.wa_app_secret) {
    const exp = "sha256=" + crypto.createHmac("sha256", w.wa_app_secret).update(raw).digest("hex");
    const got = req.headers.get("x-hub-signature-256") ?? "";
    if (got.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(exp))) return json({ error: "Bad signature" }, 401);
  }
  const body = JSON.parse(raw);
  for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
    if (ch.field === "leadgen" && ch.value?.leadgen_id) {
      try { await handleLeadgen(ws, ch.value.leadgen_id, ch.value.form_id); } catch (e) { console.error("leadgen failed", e); }
    }
  }
  return json({ ok: true });
});
