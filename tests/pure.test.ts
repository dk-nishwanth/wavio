import { describe, expect, it, vi, afterEach } from "vitest";
import { addDays, diffDays, parseDate, pretty } from "../lib/dates";
import { decrypt, encrypt } from "../lib/crypto";
import { hashPassword, verifyPassword } from "../lib/auth";
import { checkUpload } from "../lib/media";
import { renderTemplate, normalizePhone } from "../lib/core";
import { priceFor } from "../lib/billing";
import { verifyRazorpaySignature } from "../lib/payments";
import crypto from "node:crypto";

afterEach(() => vi.useRealTimers());

describe("dates", () => {
  it("parses common guest formats", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T10:00:00"));
    expect(parseDate("2026-12-20")).toBe("2026-12-20");
    expect(parseDate("20/12/2026")).toBe("2026-12-20");
    expect(parseDate("24 dec")).toBe("2026-12-24");
    expect(parseDate("Dec 24th, 2027")).toBe("2027-12-24");
    expect(parseDate("tomorrow")).toBe("2026-11-12");
  });
  it("rolls a date that already passed to next year", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T10:00:00"));
    expect(parseDate("5 jan")).toBe("2027-01-05");
  });
  it("rejects nonsense", () => {
    expect(parseDate("soon")).toBeNull();
    expect(parseDate("31/13/2026")).toBeNull();
  });
  it("does date arithmetic without timezone drift", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-12-20", "2026-12-23")).toBe(3);
    expect(pretty("2026-12-20")).toBe("20 Dec 2026");
  });
});

describe("secrets encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const e = encrypt("EAAB-token")!;
    expect(e.startsWith("enc1:")).toBe(true);
    expect(e).not.toContain("EAAB");
    expect(decrypt(e)).toBe("EAAB-token");
  });
  it("uses a fresh IV each time", () => expect(encrypt("x")).not.toBe(encrypt("x")));
  it("is idempotent and tolerates legacy plaintext and empty values", () => {
    const e = encrypt("a")!;
    expect(encrypt(e)).toBe(e);
    expect(decrypt("legacy-plain")).toBe("legacy-plain");
    expect(encrypt(null)).toBeNull();
    expect(decrypt(null)).toBeNull();
  });
  it("detects tampering", () => {
    const e = encrypt("secret")!;
    const bad = e.slice(0, -4) + (e.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decrypt(bad)).toThrow();
  });
});

describe("passwords", () => {
  it("verifies the right password only", () => {
    const h = hashPassword("correct horse");
    expect(verifyPassword("correct horse", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(h).not.toContain("correct");
  });
});

describe("helpers", () => {
  it("normalises phones (bare 10 digits are Indian)", () => {
    expect(normalizePhone("98765 43210")).toBe("919876543210");
    expect(normalizePhone("+44 7700 900123")).toBe("447700900123");
    expect(() => normalizePhone("123")).toThrow();
  });
  it("renders template variables", () => expect(renderTemplate("Hi {{1}}, room {{2}}", ["Asha", "12"])).toBe("Hi Asha, room 12"));
  it("applies GST and the annual discount", () => {
    expect(priceFor("basic", "monthly")).toEqual({ base: 1249, gst: 224.82 });
    expect(priceFor("starter", "annual").base).toBe(Math.round(2499 * 12 * 0.8));
    expect(priceFor("basic", "monthly", 2).base).toBe(1249 + 2 * 399);
  });
  it("validates uploads against WhatsApp's rules", () => {
    expect(checkUpload("image/jpeg", 1000).kind).toBe("image");
    expect(() => checkUpload("image/jpeg", 6 * 1024 * 1024)).toThrow(/5 MB/);
    expect(() => checkUpload("application/x-msdownload", 100)).toThrow(/Unsupported/);
    expect(() => checkUpload("application/pdf", 0)).toThrow(/empty/);
  });
  it("verifies Razorpay webhook signatures", () => {
    const body = '{"event":"payment_link.paid"}';
    const sig = crypto.createHmac("sha256", "whsec").update(body).digest("hex");
    expect(verifyRazorpaySignature(body, sig, "whsec")).toBe(true);
    expect(verifyRazorpaySignature(body, "deadbeef", "whsec")).toBe(false);
    expect(verifyRazorpaySignature(body + " ", sig, "whsec")).toBe(false);
  });
});
