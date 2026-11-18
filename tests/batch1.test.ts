import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { all, get, id, now, run } from "../lib/db";
import { makeWorkspace } from "./helpers";
import { estimate, roomLoad } from "../lib/pricing";
import { handleGuest } from "../lib/hotelbot";
import { hoursNote, teamIsOn } from "../lib/hours";
import { listMisses, recordMiss, resolveCovered, suggestKeywords } from "../lib/learning";
import { createRequest, decideRequest, listRequests } from "../lib/requests";
import { recordStay, listStays } from "../lib/stays";
import { receiveInbound, upsertContact } from "../lib/core";
import { saveIndustry } from "../lib/industry";
import { HI_REPLIES } from "../lib/hindi";
import { audit, recentAudit } from "../lib/audit";

let ws: string;
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-11T10:00:00")); // a Wednesday
  ({ ws } = makeWorkspace());
  saveIndustry(ws, "resort", { name: "Jawai Retreat", address: "Jawai Dam Road", google_review_url: "https://g.page/r/jawai/review", hours_open: "09:00", hours_close: "21:00" });
  run("INSERT INTO products (id, workspace_id, name, price, weekend_price, capacity, units, meal_plan, description, created_at) VALUES ('t1',?,?,?,?,?,?,?,?,?)", ws, "Safari Tent", 12000, 15000, 3, 2, "Breakfast included", "Canvas tent", now());
  run("INSERT INTO products (id, workspace_id, name, price, capacity, units, created_at) VALUES ('v1',?,?,?,?,?,?)", ws, "Pool Villa", 25000, 6, 1, now());
});
afterAll(() => vi.useRealTimers());

const guest = (phone: string) => { receiveInbound(ws, { phone, name: "Asha Rao" }, { type: "text", text: "hi" }); return get<any>("SELECT * FROM contacts WHERE workspace_id=? AND phone=?", ws, phone)!; };

describe("pricing", () => {
  const tent = { price: 12000, weekend_price: 15000, capacity: 3 };
  it("charges the weekend rate on Friday and Saturday nights only", () => {
    expect(estimate(tent, "2026-11-12", "2026-11-13", 2)).toMatchObject({ nights: 1, weekendNights: 0, total: 12000 });   // Thu night
    expect(estimate(tent, "2026-11-13", "2026-11-15", 2)).toMatchObject({ nights: 2, weekendNights: 2, total: 30000 });   // Fri + Sat
    expect(estimate(tent, "2026-11-15", "2026-11-17", 2).total).toBe(24000);                                               // Sun + Mon
  });
  it("multiplies by the rooms a group needs", () => {
    expect(estimate(tent, "2026-11-16", "2026-11-18", 7)).toMatchObject({ rooms: 3, total: 72000 });
    expect(estimate({ price: 5000 }, "2026-11-16", "2026-11-17", 3)).toMatchObject({ rooms: 2, total: 10000 }); // default sleeps 2
  });
});

describe("availability guard", () => {
  it("counts recorded stays against the number of rooms", () => {
    const a = guest("919400000001"), b = guest("919400000002");
    recordStay(ws, a.id, { check_in_date: "2027-01-10", check_out_date: "2027-01-12", guests: 2, room: "Pool Villa" });
    expect(roomLoad(ws, "Pool Villa", "2027-01-11", "2027-01-13")).toMatchObject({ units: 1, taken: 1, free: 0, full: true });
    expect(roomLoad(ws, "Pool Villa", "2027-01-12", "2027-01-14")!.full).toBe(false); // check-out day is free
    expect(roomLoad(ws, "Safari Tent", "2027-01-10", "2027-01-12")).toMatchObject({ units: 2, taken: 0, full: false });
    recordStay(ws, b.id, { check_in_date: "2027-01-10", check_out_date: "2027-01-12", guests: 2, room: "Safari Tent" });
    expect(roomLoad(ws, "safari tent", "2027-01-10", "2027-01-12")!.free).toBe(1);
  });
  it("refuses to approve an overbooking unless the admin insists", async () => {
    const c = guest("919400000003");
    const r = createRequest(ws, c.id, { kind: "booking", summary: "villa", details: { check_in_date: "2027-01-11", check_out_date: "2027-01-13", guests: 2, room: "Pool Villa" } });
    expect(listRequests(ws, "open").find((x) => x.id === r.id)!.conflict).toMatchObject({ full: true });
    await expect(decideRequest(ws, r.id, "u1", { action: "approve" })).rejects.toThrow(/fully booked/);
    await decideRequest(ws, r.id, "u1", { action: "approve", force: true });
    expect(listStays(ws, c.id)[0].status).toBe("upcoming");
  });
});

describe("the bot quotes prices", () => {
  it("lists capacity, weekend rate and inclusions", async () => {
    const r = await handleGuest(ws, null, "what are the rates", { dry: true });
    expect(r.replies[0]).toContain("*Safari Tent* — ₹12,000/night (₹15,000 Fri–Sat)");
    expect(r.replies[0]).toContain("Sleeps 3 · Breakfast included");
  });
  it("shows the stay total in the room menu and the confirmation", async () => {
    let r = await handleGuest(ws, null, "book 13 nov to 15 nov for 4 people", { dry: true });
    const menu = r.steps.find((s) => s.tool === "send_menu")!;
    expect(menu.input.options[0]).toMatchObject({ title: "Safari Tent", description: "₹60,000 for 2 nights (2 rooms)" });
    expect(menu.input.options[1]).toMatchObject({ title: "Pool Villa", description: "₹50,000 for 2 nights" });
    r = await handleGuest(ws, null, "Safari Tent", { dry: true, state: r.state });
    expect(r.replies[0]).toContain("Estimated ₹60,000 for 2 nights (2 rooms)");
    r = await handleGuest(ws, null, "yes", { dry: true, state: r.state });
    expect(r.steps.find((s) => s.tool === "create_request")!.input.details).toMatchObject({ estimate_total: 60000, rooms_needed: 2, room: "Safari Tent" });
  });
});

describe("team hours", () => {
  it("adds an offline note outside the working day only", () => {
    expect(teamIsOn(ws, new Date("2026-11-11T10:00:00"))).toBe(true);
    expect(hoursNote(ws, new Date("2026-11-11T10:00:00"))).toBe("");
    expect(hoursNote(ws, new Date("2026-11-11T23:30:00"))).toContain("reply from 9:00 AM");
    expect(teamIsOn(ws, new Date("2026-11-11T07:00:00"))).toBe(false);
  });
  it("appears in replies that promise a person", async () => {
    vi.setSystemTime(new Date("2026-11-11T23:30:00"));
    const r = await handleGuest(ws, null, "I want to speak to the manager", { dry: true });
    expect(r.replies[0]).toContain("reply from 9:00 AM");
    vi.setSystemTime(new Date("2026-11-11T10:00:00"));
  });
});

describe("learning from questions it couldn't answer", () => {
  it("counts repeats, suggests trigger words, and closes the ones an FAQ now covers", () => {
    recordMiss(ws, "Do you provide bonfire arrangement for groups?"); recordMiss(ws, "do you provide bonfire arrangement for groups"); recordMiss(ws, "ok");
    const open = listMisses(ws);
    expect(open.length).toBe(1);
    expect(open[0].count).toBe(2);
    expect(suggestKeywords(open[0].text)).toBe("provide, bonfire, arrangement, groups");
    resolveCovered(ws, "bonfire");
    expect(listMisses(ws).length).toBe(0);
  });
  it("is fed by a real unanswered question", async () => {
    const c = guest("919400000004");
    await handleGuest(ws, c.id, "do you have horse riding");
    expect(listMisses(ws).some((m) => /horse riding/.test(m.text))).toBe(true);
  });
});

describe("reviews", () => {
  const askForReview = (cid: string) => run("INSERT INTO messages (id, workspace_id, conversation_id, contact_id, direction, type, body, template_name, status, created_at) SELECT ?,?,id,?,?,?,?,?,?,? FROM conversations WHERE contact_id=?", id("m_"), ws, cid, "out", "template", "How was it?", "resort_review_request", "sent", now(), cid);
  it("a 5 after the review request earns a Google review link", async () => {
    const c = guest("919400000005"); askForReview(c.id);
    const r = await handleGuest(ws, c.id, "5");
    expect(r.replies[0]).toMatch(/delighted/);
    expect(r.steps.find((s) => s.tool === "send_link")!.input.url).toBe("https://g.page/r/jawai/review");
    expect(JSON.parse(get<any>("SELECT tags FROM contacts WHERE id=?", c.id)!.tags)).toContain("rated-5");
    expect(all("SELECT 1 FROM events WHERE contact_id=? AND name='guest_rated'", c.id).length).toBe(1);
  });
  it("a low rating goes to the manager as a complaint", async () => {
    const c = guest("919400000006"); askForReview(c.id);
    const r = await handleGuest(ws, c.id, "2 stars");
    expect(r.handoff).toBe(true);
    expect(all<any>("SELECT kind FROM requests WHERE contact_id=?", c.id).map((x) => x.kind)).toContain("complaint");
  });
  it("a lone number is not a rating unless we just asked", async () => {
    const c = guest("919400000007");
    const r = await handleGuest(ws, c.id, "4");
    expect(r.steps.some((s) => s.tool === "send_link")).toBe(false);
    expect(all("SELECT 1 FROM events WHERE contact_id=? AND name='guest_rated'", c.id).length).toBe(0);
  });
});

describe("Hindi", () => {
  it("answers in Devanagari when the guest writes it, then follows them back to English", async () => {
    let r = await handleGuest(ws, null, "नमस्ते", { dry: true });
    expect(r.replies[0]).toContain("आपका स्वागत है");
    expect(r.steps[0].input.options[0].title).toBe("कमरे और रेट");
    r = await handleGuest(ws, null, "रेट क्या है", { dry: true, state: r.state });
    expect(r.replies[0]).toContain("हमारे कमरे");
    r = await handleGuest(ws, null, "what is the location", { dry: true, state: r.state });
    expect(r.state.lang).toBeUndefined();
    expect(r.replies[0]).toContain("Jawai Dam Road");
  });
  it("has a Hindi wording for every reply that matters", () => {
    for (const k of ["greeting", "ask_dates", "ask_guests", "confirm_booking", "booking_sent", "human", "unknown"]) expect(HI_REPLIES[k]).toMatch(/[ऀ-ॿ]/);
  });
});

describe("audit log", () => {
  it("records who did what, newest first", () => {
    const s = { workspaceId: ws, userId: "u1", name: "Nish" };
    audit(s, "settings.save", "business profile"); audit(s, "request.approve", "BK1234");
    expect(recentAudit(ws).map((a) => a.action).slice(0, 2)).toEqual(["request.approve", "settings.save"]);
  });
});
void upsertContact;
