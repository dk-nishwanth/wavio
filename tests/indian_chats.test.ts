import { beforeAll, describe, expect, it } from "vitest";
import { get, now, run } from "../lib/db";
import { makeWorkspace } from "./helpers";
import { saveIndustry } from "../lib/industry";
import { addText } from "../lib/kb";
import { handleGuest } from "../lib/hotelbot";
import { receiveInbound } from "../lib/core";

let ws: string; let n = 0;
beforeAll(() => {
  ({ ws } = makeWorkspace());
  saveIndustry(ws, "resort", { name: "Jawai Retreat", address: "Jawai Dam Road, Rajasthan", check_in_time: "12:00 PM", check_out_time: "11:00 AM" });
  run("INSERT INTO products (id, workspace_id, name, price, description, capacity, created_at) VALUES ('p1',?,?,?,?,?,?),('p2',?,?,?,?,?,?),('p3',?,?,?,?,?,?)", ws, "Safari Tent", 12000, "Tent with bath", 3, now(), ws, "Pool Villa", 25000, "Private pool", 6, now(), ws, "Deluxe Room", 8000, "AC room", 2, now());
  addText(ws, "Facilities", "Pets are welcome with prior notice. Free parking. Vegetarian and Jain food available. Free wifi. 50% advance is needed to confirm the booking. Cancellation is free up to 7 days before check in. Leopard safari can be arranged. Nearest airport is Udaipur, 150 km.");
});
async function chat(msgs: string[]) {
  const phone = "9198" + String(10000000 + n++);
  receiveInbound(ws, { phone, name: "Rahul" }, { type: "text", text: msgs[0] });
  const c = get<any>("SELECT * FROM contacts WHERE phone=?", phone)!;
  run("UPDATE conversations SET bot_paused=0 WHERE contact_id=?", c.id);
  const replies: string[] = []; let last: any;
  for (const m of msgs) { last = await handleGuest(ws, c.id, m); replies.push(last.replies.join(" | ")); }
  return { replies, last, c };
}

describe("average Indian guest chats", () => {
  it("books from one rambling message and the guest can answer side questions mid-way", async () => {
    const { replies, last } = await chat(["hi 2 rooms 2 adults and 2 kids 4 days from 10 jan", "veg food milega?", "pool villa", "haan bhej do"]);
    expect(replies[0]).toContain("4 days = 3 nights");
    expect(replies[1]).toMatch(/Vegetarian/);
    expect(replies[1]).toMatch(/Which stay/);
    expect(replies[2]).toMatch(/Pool Villa × 2/);
    expect(last.replies.join(" ")).toMatch(/sent your request/);
  });
  it("understands slang, 10k budgets, Hinglish and kids added later", async () => {
    expect((await chat(["hi", "budget 10k"])).replies[1]).toMatch(/Deluxe Room/);
    expect((await chat(["kitna door hai udaipur se"])).replies[0]).toMatch(/Udaipur, 150 km/);
    expect((await chat(["can i bring my dog"])).replies[0]).toMatch(/Pets are welcome/);
    const r = await chat(["room avlbl 20 dec to 22 dec", "2 adult", "1 bacha bhi hai", "cheapest"]);
    expect(r.replies[3]).toMatch(/3 \(2 adults, 1 kid\)|3 guests/);
    expect(r.replies[3]).toMatch(/Deluxe Room/);
  });
  it("handles refund, status and policy questions without starting a booking", async () => {
    const a = await chat(["refund kab milega"]); expect(a.replies[0]).toMatch(/refund/); expect(a.last.handoff).toBe(true);
    expect((await chat(["booking status"])).replies[0]).toMatch(/can't see any bookings|booking/);
    expect((await chat(["what is cancellation policy"])).replies[0]).toMatch(/free up to 7 days/);
  });
  it("reminds instead of re-asking when the guest says they already told", async () => {
    const r = await chat(["25 dec to 27 dec 3 people", "i already told the dates"]);
    expect(r.replies[1]).toMatch(/I have 25 Dec/);
  });
  it("answers policy, price pushback, comparisons and partner/slang wording", async () => {
    expect((await chat(["hi i want to know about advance payment"])).replies[0]).toMatch(/50% advance/);
    expect((await chat(["cancellation free hai?"])).replies[0]).toMatch(/free up to 7 days/);
    const p = await chat(["2 adults 25 dec to 27 dec", "too costly"]);
    expect(p.replies[1]).toMatch(/most affordable/);
    const c = await chat(["book 20 dec to 22 dec 3 people", "deluxe or tent which is better?"]);
    expect(c.replies[1]).toMatch(/Safari Tent/);
    const g = await chat(["room hai kya 14 feb ko", "gf ke sath"]);
    expect(g.replies[1]).toMatch(/2 guests/);
    expect((await chat(["I booked already, want to change my dates"])).last.handoff).toBe(true);
    expect((await chat(["15 tarikh se room chahiye"])).replies[0]).not.toMatch(/Which dates/);
  });
  it("handles groups, family counts, menus by number, totals and thanks", async () => {
    expect((await chat(["i m planing trip with my frnds 6 guys"])).replies[0]).toMatch(/6 guests/);
    expect((await chat(["Looking for a place for my parents anniversary"])).replies[0]).toMatch(/2 guests/);
    expect((await chat(["hi", "me my wife mom dad"])).replies[1]).toMatch(/4 guests|Which dates/);
    const m = await chat(["hello", "1"]); expect(m.replies[1]).toMatch(/Safari Tent/);
    expect((await chat(["how much for 2 nights"])).replies[0]).toMatch(/Deluxe Room.*₹16,000/);
    const t = await chat(["25 dec to 27 dec 3 people tent", "yes", "what is the total"]);
    expect(t.replies[2]).toMatch(/estimate is ₹/);
    expect((await chat(["thank you so much, great service"])).replies[0]).toMatch(/welcome/i);
    const l = await chat(["reach on friday leave sunday", "3 people", "tent", "what time can we check in friday"]);
    expect(l.replies[3]).toMatch(/Check-in is from 12:00 PM/);
  });
});
