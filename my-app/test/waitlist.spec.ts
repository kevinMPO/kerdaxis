import { describe, it, expect } from "vitest";
import { parseWaitlistBody as parse } from "../src/waitlist";

describe("POST /waitlist — validation", () => {
  it("keeps the historical waitlist format", () => {
    expect(parse({ email: " A@B.co ", lang: "fr", source: "landing" })).toEqual({
      ok: true,
      key: "wl:a@b.co",
      entry: { kind: "waitlist", email: "a@b.co", lang: "fr", source: "landing" },
    });
  });

  it("rejects a bad or missing email", () => {
    expect(parse({ email: "nope" })).toEqual({ ok: false, error: "invalid_email" });
    expect(parse(null)).toEqual({ ok: false, error: "invalid_email" });
  });

  it("accepts and drops a filled honeypot", () => {
    expect(parse({ email: "a@b.co", website: "http://spam" })).toEqual({ ok: true, bot: true });
  });

  it("requires a name and a firm for a partner request", () => {
    expect(parse({ kind: "partner", email: "a@b.co" })).toEqual({ ok: false, error: "missing_name" });
    expect(parse({ kind: "partner", email: "a@b.co", name: "Ann" })).toEqual({ ok: false, error: "missing_company" });
  });

  it("stores a partner request under its own prefix, with a known client range only", () => {
    expect(parse({ kind: "partner", email: "a@b.co", name: "Ann\nX", company: "Cabinet", clients: "21-100" })).toEqual({
      ok: true,
      key: "partner:a@b.co",
      entry: { kind: "partner", email: "a@b.co", lang: "", source: "", name: "Ann X", company: "Cabinet", clients: "21-100" },
    });
    const r = parse({ kind: "partner", email: "a@b.co", name: "Ann", company: "C", clients: "9999" });
    expect(r.ok && "entry" in r && r.entry.clients).toBe(undefined);
  });
});
