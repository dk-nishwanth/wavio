import crypto from "node:crypto";
import { get } from "@/lib/db";
import { applyStatus, receiveInbound } from "@/lib/core";
import { handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ ws: string }> };

// Meta webhook verification handshake
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { ws } = await params;
  const w = get<any>("SELECT wa_verify_token FROM workspaces WHERE id=?", ws);
  const u = new URL(req.url);
  if (w && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === w.wa_verify_token) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return json({ error: "Verification failed" }, 403);
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { ws } = await params;
  const w = get<any>("SELECT * FROM workspaces WHERE id=?", ws);
  if (!w) return json({ error: "Unknown workspace" }, 404);
  const raw = await req.text();
  if (w.wa_app_secret) {
    const expected = "sha256=" + crypto.createHmac("sha256", w.wa_app_secret).update(raw).digest("hex");
    const got = req.headers.get("x-hub-signature-256") ?? "";
    if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return json({ error: "Bad signature" }, 401);
  }
  const body = JSON.parse(raw);
  for (const entry of body.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      const names: Record<string, string> = {};
      for (const c of v.contacts ?? []) names[c.wa_id] = c.profile?.name;
      for (const m of v.messages ?? []) {
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type}]`;
        receiveInbound(ws, { phone: m.from, name: names[m.from] }, { waId: m.id, type: m.type, text });
      }
      for (const s of v.statuses ?? []) applyStatus(s.id, s.status, s.errors?.[0]?.title);
    }
  }
  return json({ ok: true }); // always 200 quickly so Meta doesn't retry
});
