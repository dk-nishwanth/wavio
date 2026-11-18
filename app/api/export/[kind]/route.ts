import { all } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { listStays } from "@/lib/stays";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ kind: string }> };
const date = (t: number | null) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) : "");

/** CSV downloads for Excel/Sheets: contacts, leads, stays, requests, orders, or one guest's messages (?contactId=). */
export async function GET(req: Request, { params }: Ctx) {
  const s = await requireSession();
  const { kind } = await params; const ws = s.workspaceId;
  let headers: string[] = [], rows: unknown[][] = [];
  if (kind === "contacts") {
    headers = ["Name", "Phone", "Email", "Opted in", "Tags", "Added"];
    rows = all<any>("SELECT * FROM contacts WHERE workspace_id=? ORDER BY created_at DESC", ws).map((c) => [c.name, "+" + c.phone, c.email, c.opted_in ? "yes" : "no", JSON.parse(c.tags).join("; "), date(c.created_at)]);
  } else if (kind === "leads") {
    headers = ["Name", "Phone", "Stage", "Score", "Source", "Deal value", "Follow-up", "Created"];
    rows = all<any>("SELECT l.*, c.name, c.phone FROM leads l JOIN contacts c ON c.id=l.contact_id WHERE l.workspace_id=? ORDER BY l.score DESC", ws).map((l) => [l.name, "+" + l.phone, l.stage, l.score, l.source, l.value, date(l.follow_up_at), date(l.created_at)]);
  } else if (kind === "stays") {
    headers = ["Booking", "Guest", "Phone", "Room", "Check-in", "Check-out", "Nights", "Guests", "Status"];
    rows = listStays(ws).map((x) => [x.booking_id, x.name, "+" + x.phone, x.room, x.check_in_date, x.check_out_date, x.nights, x.guests, x.status]);
  } else if (kind === "requests") {
    headers = ["Type", "Guest", "Phone", "Summary", "Status", "Raised by", "Created", "Decided"];
    rows = all<any>("SELECT r.*, c.name, c.phone FROM requests r JOIN contacts c ON c.id=r.contact_id WHERE r.workspace_id=? ORDER BY r.created_at DESC", ws).map((r) => [r.kind, r.name, "+" + r.phone, r.summary, r.status, r.created_by, date(r.created_at), date(r.decided_at)]);
  } else if (kind === "orders") {
    headers = ["Order", "Guest", "Phone", "Total", "Status", "Created", "Paid"];
    rows = all<any>("SELECT o.*, c.name, c.phone FROM orders o JOIN contacts c ON c.id=o.contact_id WHERE o.workspace_id=? ORDER BY o.created_at DESC", ws).map((o) => [o.number, o.name, "+" + o.phone, o.total, o.status, date(o.created_at), date(o.paid_at)]);
  } else if (kind === "messages") {
    const cid = new URL(req.url).searchParams.get("contactId");
    if (!cid) throw new HttpError(400, "contactId is required");
    headers = ["Time", "From", "Type", "Message"];
    rows = all<any>("SELECT * FROM messages WHERE contact_id=? AND workspace_id=? ORDER BY created_at, rowid", cid, ws).map((m) => [date(m.created_at), m.direction === "in" ? "Guest" : m.ai ? "Bot" : m.is_note ? "Note" : "Team", m.type, m.body]);
  } else throw new HttpError(404, "Unknown export");
  audit(s, "export", `${kind} (${rows.length} rows)`);
  return new Response(toCsv(headers, rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="wavio-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
