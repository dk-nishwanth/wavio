import { all, get, id, now, run } from "./db";
import { HttpError } from "./auth";
import { logActivity } from "./crm";
import { createOrder } from "./orders";
import { createPaymentLink } from "./payments";
import { cancelStay, recordStay } from "./stays";
import { emitWebhook, queueCtaUrl, queueText, windowOpen, ensureConversation } from "./core";
import { metaCfg } from "./metaleads";

export const REQUEST_KINDS = ["booking", "cancellation", "change", "service", "callback", "complaint", "handoff", "other"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
/** Kinds an admin may let the concierge approve on its own. Anything touching bookings or money always needs a person. */
export const AUTO_APPROVABLE: RequestKind[] = ["service", "callback", "other"];

export const autoApprove = (ws: string): RequestKind[] => ((metaCfg(ws).ai?.auto_approve ?? []) as RequestKind[]).filter((k) => AUTO_APPROVABLE.includes(k));

export function createRequest(ws: string, contactId: string, r: { kind: RequestKind; summary: string; details?: Record<string, any>; by?: string }) {
  if (!REQUEST_KINDS.includes(r.kind)) throw new HttpError(400, `Unknown request type "${r.kind}"`);
  const rid = id("rq_");
  const auto = autoApprove(ws).includes(r.kind);
  run("INSERT INTO requests (id, workspace_id, contact_id, kind, summary, details, status, created_by, created_at, decided_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    rid, ws, contactId, r.kind, r.summary.slice(0, 300), JSON.stringify(r.details ?? {}), auto ? "done" : "open", r.by ?? "ai", now(), auto ? now() : null);
  logActivity(ws, contactId, "request", `${r.by === "admin" ? "Request" : "AI concierge"} logged a ${r.kind} request: ${r.summary.slice(0, 120)}${auto ? " (auto-approved)" : ""}`);
  emitWebhook(ws, "request.created", { requestId: rid, kind: r.kind, summary: r.summary, contactId, autoApproved: auto });
  return { id: rid, status: auto ? "done" : "open", autoApproved: auto };
}

export const pendingRequests = (ws: string) => get<any>("SELECT COUNT(*) n FROM requests WHERE workspace_id=? AND status='open'", ws)!.n as number;

export function listRequests(ws: string, status?: string) {
  return all<any>(
    `SELECT r.*, c.name, c.phone FROM requests r JOIN contacts c ON c.id=r.contact_id WHERE r.workspace_id=? ${status ? "AND r.status=?" : ""} ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 200`,
    ...(status ? [ws, status] : [ws]),
  ).map((r) => ({ ...r, details: JSON.parse(r.details) }));
}

/** Tell the guest something. Free text only works inside the 24-hour window; otherwise it's noted for the admin. */
function tellGuest(ws: string, contactId: string, text: string) {
  if (!text.trim()) return false;
  const conv = ensureConversation(ws, contactId);
  if (!windowOpen(conv)) { logActivity(ws, contactId, "request", "Couldn't message the guest (24-hour window closed) — send a template"); return false; }
  queueText(ws, contactId, text.trim());
  return true;
}

export type Decision = { action: "approve" | "decline" | "done"; note?: string; message?: string; advance?: number };

export async function decideRequest(ws: string, requestId: string, userId: string, d: Decision) {
  const r = get<any>("SELECT * FROM requests WHERE id=? AND workspace_id=?", requestId, ws);
  if (!r) throw new HttpError(404, "Request not found");
  if (r.status === "done" || r.status === "declined") throw new HttpError(409, `This request is already ${r.status}`);
  const details = JSON.parse(r.details);
  let status = d.action === "decline" ? "declined" : "done";
  let message = d.message ?? "";

  if (d.action === "approve" && r.kind === "booking") {
    const { check_in_date, check_out_date } = details;
    if (!check_in_date || !check_out_date) throw new HttpError(400, "This booking request has no dates — edit the details or decline it");
    const advance = Math.max(0, Number(d.advance) || 0);
    if (advance > 0) {
      const o = createOrder(ws, r.contact_id, [{ name: `Advance — stay ${check_in_date} to ${check_out_date}`, price: advance, qty: 1 }]);
      run("UPDATE orders SET request_id=? WHERE id=?", requestId, o.id);
      const link = await createPaymentLink(o.id);
      status = "approved"; // waiting for the advance; the payment confirms the stay
      const conv = ensureConversation(ws, r.contact_id);
      if (windowOpen(conv)) queueCtaUrl(ws, r.contact_id, { body: message || `Good news — we can host you! Please pay the advance of ₹${advance.toLocaleString("en-IN")} to confirm your stay.`, label: "Pay advance", url: link });
      message = "";
    } else {
      recordStay(ws, r.contact_id, { check_in_date, check_out_date, guests: Number(details.guests) || 2, room: details.room });
    }
  } else if (d.action === "approve" && r.kind === "cancellation") {
    if (!details.booking_id) throw new HttpError(400, "This request has no booking ID");
    cancelStay(ws, r.contact_id, String(details.booking_id));
  }
  if (message) tellGuest(ws, r.contact_id, message);
  run("UPDATE requests SET status=?, decided_by=?, decision_note=?, decided_at=? WHERE id=?", status, userId, d.note ?? null, now(), requestId);
  logActivity(ws, r.contact_id, "request", `${r.kind} request ${status}${d.note ? `: ${d.note}` : ""}`);
  return { status };
}

/** Called when an advance payment arrives: confirm the stay the request was for. */
export function completeBookingRequest(requestId: string) {
  const r = get<any>("SELECT * FROM requests WHERE id=?", requestId);
  if (!r || r.status !== "approved" || r.kind !== "booking") return;
  const d = JSON.parse(r.details);
  try { recordStay(r.workspace_id, r.contact_id, { check_in_date: d.check_in_date, check_out_date: d.check_out_date, guests: Number(d.guests) || 2, room: d.room }); } catch (e) { console.error("stay after payment failed", e); return; }
  run("UPDATE requests SET status='done', decided_at=? WHERE id=?", now(), requestId);
}
