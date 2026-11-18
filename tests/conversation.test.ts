import { describe, it, expect } from "vitest";
import { extractStay, parseParty, parseRooms } from "../lib/slots";

describe("how Indian guests really write", () => {
  it("counts people the way people say it", () => {
    expect(parseParty("2 adults and 2 kids").total).toBe(4);
    expect(parseParty("family of 4 with 2 kids").total).toBe(4);
    expect(parseParty("me and my wife and 2 kids").total).toBe(4);
    expect(parseParty("I want to book a room").total).toBeUndefined();
    expect(parseParty("just me").total).toBe(1);
  });
  it("reads rooms and 4 days as 3 nights", () => {
    expect(parseRooms("2 rooms please")).toBe(2);
    const e = extractStay("4 days from 10 jan", {});
    expect(e.nights).toBe(3);
    expect(e.notes.length).toBeGreaterThan(0);
  });
});
