import { addDays, diffDays } from "./dates";
import { listStays } from "./stays";
import { all, get } from "./db";

export type Priced = { price: number; weekend_price?: number | null; capacity?: number | null };
const isWeekend = (iso: string) => { const d = new Date(iso + "T00:00:00Z").getUTCDay(); return d === 5 || d === 6; }; // Friday and Saturday nights

/** Price for a stay: nightly rate (weekend rate on Fri/Sat nights when set), times the rooms needed for the group. */
export function estimate(p: Priced, checkIn: string, checkOut: string, guests: number) {
  const nights = Math.max(0, diffDays(checkIn, checkOut));
  const rooms = Math.max(1, Math.ceil((guests || 1) / Math.max(1, p.capacity ?? 2)));
  let perRoom = 0, weekendNights = 0;
  for (let i = 0; i < nights; i++) {
    const day = addDays(checkIn, i);
    if (p.weekend_price && isWeekend(day)) { perRoom += p.weekend_price; weekendNights++; } else perRoom += p.price;
  }
  return { nights, rooms, weekendNights, perRoom, total: perRoom * rooms };
}

/** How many of this room are already taken on the dates (from recorded, non-cancelled stays). */
export function roomLoad(ws: string, roomName: string | undefined | null, checkIn: string, checkOut: string) {
  if (!roomName) return null;
  const product = get<any>("SELECT units FROM products WHERE workspace_id=? AND lower(name)=lower(?) AND active=1", ws, roomName);
  if (!product) return null;
  const taken = listStays(ws).filter((s) => ["upcoming", "in_house"].includes(s.status) && String(s.room ?? "").toLowerCase() === roomName.toLowerCase() && s.check_in_date < checkOut && s.check_out_date > checkIn).length;
  return { units: product.units as number, taken, free: Math.max(0, product.units - taken), full: taken >= product.units };
}

export const money = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
void all;
