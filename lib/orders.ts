import { get, id, now, run } from "./db";
import { HttpError } from "./auth";
import { ingestEvent } from "./events";
import { logActivity } from "./crm";

export type Item = { product_id?: string; name: string; price: number; qty: number };

export function createOrder(ws: string, contactId: string, rawItems: { product_id?: string; name?: string; price?: number; qty?: number }[]) {
  if (!rawItems?.length) throw new HttpError(400, "An order needs at least one item");
  const items: Item[] = rawItems.map((it) => {
    const p = it.product_id ? get<any>("SELECT * FROM products WHERE id=? AND workspace_id=?", it.product_id, ws) : null;
    if (it.product_id && !p) throw new HttpError(404, "Product not found");
    const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
    return { product_id: p?.id, name: p?.name ?? String(it.name ?? "Item"), price: p ? p.price : Math.max(0, Number(it.price) || 0), qty };
  });
  const total = items.reduce((a, i) => a + i.price * i.qty, 0);
  const number = (get<any>("SELECT COALESCE(MAX(number),1000) n FROM orders WHERE workspace_id=?", ws)!.n as number) + 1;
  const oid = id("ord_");
  run("INSERT INTO orders (id, workspace_id, number, contact_id, status, total, items, created_at) VALUES (?,?,?,?,?,?,?,?)", oid, ws, number, contactId, "pending", total, JSON.stringify(items), now());
  const c = get<any>("SELECT phone FROM contacts WHERE id=?", contactId);
  logActivity(ws, contactId, "order", `Order #${number} created (₹${total})`);
  if (c) ingestEvent(ws, { name: "order_created", phone: c.phone, payload: { order_id: String(number), total } });
  return { id: oid, number, total };
}

export const money = (n: number) => "₹" + n.toLocaleString("en-IN");
