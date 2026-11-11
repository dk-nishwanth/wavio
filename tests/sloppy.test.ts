import { beforeAll, describe, expect, it, vi } from "vitest";
import { all, get, now, run } from "../lib/db";
import { makeWorkspace } from "./helpers";
import { editDistance, makeVocab, nearest, normalizeMessage } from "../lib/fuzzy";
import { detectIntents, handleGuest } from "../lib/hotelbot";
import { parseDateRange, parseGuests, isoToday, addDays } from "../lib/dates";
import { saveIndustry } from "../lib/industry";
import { receiveInbound } from "../lib/core";
import { addText } from "../lib/kb";
import { clearVocabCache } from "../lib/fuzzy";

let ws: string;
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-11T10:00:00"));
  ({ ws } = makeWorkspace());
  saveIndustry(ws, "resort", { name: "Jawai Retreat", address: "Jawai Dam Road", latitude: 25.1, longitude: 73.2 });
  run("INSERT INTO products (id, workspace_id, name, price, description, created_at) VALUES ('p1',?,?,?,?,?),('p2',?,?,?,?,?)", ws, "Safari Tent", 12000, "Sleeps 3", now(), ws, "Pool Villa", 25000, "Sleeps 6", now());
  addText(ws, "Facilities", "Pets are welcome with prior notice. Free parking is available for all guests. The swimming pool is open from 7 AM to 7 PM.");
  clearVocabCache();
});

const intent = (t: string) => {
  const v = makeVocabFor();
  return detectIntents(normalizeMessage(t, v))[0]?.intent;
};
import { cachedVocab } from "../lib/fuzzy";
function makeVocabFor() {
  // same vocabulary the bot builds, via a real conversation turn's cache
  return cachedVocab(`bot:${ws}`, () => []);
}

describe("spelling and text-speak", () => {
  it("measures edit distance including swapped letters", () => {
    expect(editDistance("booking", "bokking")).toBe(1);
    expect(editDistance("cancel", "cancle")).toBe(1);
    expect(editDistance("avialable", "available")).toBe(1);
    expect(editDistance("abc", "xyz", 1)).toBeGreaterThan(1);
  });
  it("corrects typos only when it is safe", () => {
    const v = makeVocab(["booking", "rooms", "available", "december", "swimming", "tent", "pets"]);
    expect(nearest("bokking", v)).toBe("booking");
    expect(nearest("decmber", v)).toBe("december");
    expect(nearest("swiming", v)).toBe("swimming");
    expect(nearest("rent", v)).toBeNull();      // different first letter: a real word, leave it
    expect(nearest("this", v)).toBeNull();      // protected common word
    expect(nearest("xyzabc", v)).toBeNull();
  });
  it("cleans up how people really type", () => {
    const v = makeVocab(["hello", "room", "rooms", "december", "available", "people", "tomorrow"]);
    expect(normalizeMessage("hellooo pls tell rooom avlbl 20dec 4ppl", v)).toContain("hello please");
    expect(normalizeMessage("20dec to 23 decmber for 4 ppl", v)).toBe("20 dec to 23 december for 4 people");
    expect(normalizeMessage("2 adlts n 1 kid", v)).toBe("2 adults and 1 kids");
    expect(normalizeMessage("teen log hain", v)).toContain("3 people");
    expect(normalizeMessage("family of five", v)).toBe("family of 5");
    expect(normalizeMessage("Hello Sir, kindly share rates", v)).toBe("hello please share rates");
    expect(normalizeMessage("3n stay from 25th", v)).toContain("3 nights");
  });
  it("reads dates and guests however they are written", () => {
    const d = (t: string, v = makeVocab(["december", "november", "january", "february", "tomorrow"])) => parseDateRange(normalizeMessage(t, v));
    expect(d("20 decmber to 23 decmber")).toMatchObject({ check_in: "2026-12-20", check_out: "2026-12-23" });
    expect(d("20dec 3n")).toMatchObject({ check_in: "2026-12-20", check_out: "2026-12-23" });
    expect(d("from 5th jan 2 nights")).toMatchObject({ check_in: "2027-01-05", nights: 2 });
    expect(d("tmrw for 2 nts")).toMatchObject({ check_in: "2026-11-12", check_out: "2026-11-14" });
    expect(d("parso")).toMatchObject({ check_in: "2026-11-13" });
    expect(d("this friday")).toMatchObject({ check_in: "2026-11-13" });
    const g = (t: string) => parseGuests(normalizeMessage(t, makeVocab(["people"])));
    expect(g("4 ppl")).toBe(4); expect(g("we r 5 pax")).toBe(5); expect(g("2 adlt 2 bachhe")).toBe(4); expect(g("honeymoon couple")).toBe(2);
  });
});

/** Runs a whole sloppy message through the live bot and returns what it understood. */
async function top(text: string) {
  receiveInbound(ws, { phone: "9199" + Math.floor(Math.random() * 1e8), name: "G" }, { type: "text", text: "x" });
  const r = await handleGuest(ws, null, text, { dry: true });
  return r;
}

describe("real messages from real guests", () => {
  const cases: [string, RegExp][] = [
    // rates, every way of asking
    ["rates?", /Safari Tent/], ["pls tell me the rates", /Safari Tent/], ["wat r the rates", /Safari Tent/], ["room tariff plz", /Safari Tent/], ["rooms ka rate kya hai", /Safari Tent/],
    ["price list bhejo", /Safari Tent/], ["kitne ka hai room", /Safari Tent/], ["rate kitna hai", /Safari Tent/], ["how much per nite", /Safari Tent/], ["ratess", /Safari Tent/],
    ["hello sir kindly share the tariff", /Safari Tent/], ["tarrif for ac room", /Safari Tent/], ["रेट क्या है", /Safari Tent/], ["RATES!!!", /Safari Tent/], ["prise of rooms", /Safari Tent/],
    // greetings
    ["hii", /Welcome to Jawai Retreat/], ["hellooooo", /Welcome to Jawai Retreat/], ["helo", /Welcome to Jawai Retreat/], ["good mrng", /Welcome to Jawai Retreat/], ["namaste", /Welcome to Jawai Retreat/], ["hello sir", /Welcome to Jawai Retreat/],
    // booking intent starts the questions
    ["i want to book a room", /Which dates/], ["need rooom", /Which dates/], ["room required for 2 days", /Which dates/], ["bokking karna hai", /Which dates/], ["do u have rooms available", /Which dates/],
    ["rooms available?", /Which dates/], ["avialable rooms", /Which dates/], ["book karni hai", /Which dates/], ["plan a trip", /Which dates/],
    // location, photos, timings
    ["where r u located", /Jawai Dam Road/], ["location pls", /Jawai Dam Road/], ["adress", /Jawai Dam Road/], ["how to reach", /Jawai Dam Road/], ["kaha hai resort", /Jawai Dam Road/],
    ["check in time?", /Check-in is from/], ["chkin timing", /Check-in is from/], ["what time is checkout", /Check-in is from/], ["kitne baje check in", /Check-in is from/],
    // services
    ["need airport pikup", /airport pickup/], ["can u arrange a cab", /airport pickup/], ["extra bed chahiye", /extra bed/], ["pls arrange cake and decoration", /special arrangement/], ["jeep safri booking", /safari/],
    // people / complaints / thanks
    ["i want to talk to manager", /alerted our team/], ["call me back pls", /call you back/], ["worst service ever", /sorry about that/], ["very bad experience", /sorry about that/], ["thanku", /welcome/], ["thanks a lot", /welcome/], ["ok", /welcome|anything else/],
    // knowledge base with typos
    ["do u allow petss", /Pets are welcome/], ["is der parking", /parking/], ["swiming pool timing", /swimming pool is open/], ["wat r the pool timings", /swimming pool is open/],
  ];
  for (const [msg, want] of cases) {
    it(`"${msg}"`, async () => {
      const r = await top(msg);
      expect(r.replies.join(" | ") + " " + r.steps.map((s) => s.result + JSON.stringify(s.input)).join(" ")).toMatch(want);
    });
  }

  it("books from one rambling message full of mistakes", async () => {
    const r = await top("hi sir i want 2 book rooom for 4 ppl from 20dec to 23 decmber pls");
    expect(r.state.slots).toMatchObject({ check_in: "2026-12-20", check_out: "2026-12-23", guests: 4 });
    expect(r.state.step).toBe("book_room");
  });
  it("completes a booking written entirely in sloppy Hinglish", async () => {
    let r = await handleGuest(ws, null, "bhai room book karna hai", { dry: true });
    r = await handleGuest(ws, null, "20 dec se 22 dec", { dry: true, state: r.state });
    r = await handleGuest(ws, null, "4 log", { dry: true, state: r.state });
    r = await handleGuest(ws, null, "pool villa", { dry: true, state: r.state });
    expect(r.state.step).toBe("book_confirm");
    r = await handleGuest(ws, null, "haan", { dry: true, state: r.state });
    expect(r.replies[0]).toMatch(/sent your request/);
  });
  it("understands sloppy confirmations", async () => {
    const base = await handleGuest(ws, null, "book room 20 dec to 22 dec for 2 ppl safari tnt", { dry: true });
    expect(base.state.step).toBe("book_confirm");
    for (const yes of ["yess", "ok pls send", "haan ji", "ya sure", "yep"]) { const r = await handleGuest(ws, null, yes, { dry: true, state: base.state }); expect(r.replies[0], yes).toMatch(/sent your request/); }
    for (const no of ["nahi", "nope", "change it"]) { const r = await handleGuest(ws, null, no, { dry: true, state: base.state }); expect(r.replies[0], no).toMatch(/start again/); }
  });
  it("does not 'fix' ordinary words into hotel words", async () => {
    const r = await top("my name is Rohit and I live in Pune");
    expect(r.unknown).toBe(true);           // nothing hotel-related here: must not invent an intent
    expect(r.replies.join(" ")).not.toMatch(/Safari|Which dates/);
  });
});
void intent; void get; void all; void addDays; void isoToday;
