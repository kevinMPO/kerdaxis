import { describe, expect, it } from "vitest";
import { cancelsOnline, needsCancelCheck } from "@/app/dashboard/use-dashboard";
import type { Lever } from "@/lib/types";
import { buildChannelQuery, parseCancelChannel } from "../cancel-channel";
import { ResearchError } from "../types";

const CHECKED_AT = "2026-11-08";

describe("parseCancelChannel (Linkup → canal de résiliation)", () => {
  it("should mark the supplier online when the official page says self-serve", () => {
    const result = parseCancelChannel(
      { data: { self_serve_online: true, official_doc_url: "https://support.loom.com/cancel" }, sources: [] },
      CHECKED_AT,
    );
    expect(result).toEqual({ channel: "online", sourceUrl: "https://support.loom.com/cancel", checkedAt: CHECKED_AT });
  });

  it("should mark the supplier offline when cancelling needs support or a letter", () => {
    const result = parseCancelChannel(
      { data: { self_serve_online: false, official_doc_url: "https://help.example.com/terminate" } },
      CHECKED_AT,
    );
    expect(result.channel).toBe("offline");
  });

  it("should fall back to the first cited source when the doc URL field is not a URL", () => {
    const result = parseCancelChannel(
      { data: { self_serve_online: true, official_doc_url: "not specified" }, sources: [{ url: "nope" }, { url: "https://help.example.com/a" }] },
      CHECKED_AT,
    );
    expect(result.sourceUrl).toBe("https://help.example.com/a");
  });

  it("should reject an answer without any source (rule 4)", () => {
    expect(() => parseCancelChannel({ data: { self_serve_online: true, official_doc_url: "" } }, CHECKED_AT)).toThrow(ResearchError);
  });

  it("should reject an answer that does not decide", () => {
    expect(() => parseCancelChannel({ data: { official_doc_url: "https://help.example.com/a" } }, CHECKED_AT)).toThrow(ResearchError);
  });

  it("should only put the supplier name in the query", () => {
    expect(buildChannelQuery("Loom")).toContain("Loom");
  });
});

const lever = (overrides: Partial<Lever>): Lever => ({ id: "loom", label: "Loom", to: "", saving: 23, risk: "med", active: true, action: "cancel", ...overrides });

describe("agent or letter", () => {
  it("should send an online cancellation to the agent", () => {
    expect(cancelsOnline(lever({ cancelChannel: { channel: "online", sourceUrl: "https://x.test", checkedAt: CHECKED_AT } }))).toBe(true);
  });

  it("should keep a letter when the supplier cannot be cancelled online, or before Linkup answered", () => {
    expect(cancelsOnline(lever({ cancelChannel: { channel: "offline", sourceUrl: "https://x.test", checkedAt: CHECKED_AT } }))).toBe(false);
    expect(cancelsOnline(lever({ cancelChannel: { channel: "unknown", sourceUrl: "", checkedAt: CHECKED_AT } }))).toBe(false);
    expect(cancelsOnline(lever({}))).toBe(false);
  });

  it("should offer the agent on any subscription cancellable online, whatever the recommended action", () => {
    const online = { channel: "online", sourceUrl: "https://x.test", checkedAt: CHECKED_AT } as const;
    expect(cancelsOnline(lever({ action: "renegotiate", cancelChannel: online }))).toBe(true);
    expect(cancelsOnline(lever({ action: "consolidate", cancelChannel: online }))).toBe(true);
    expect(needsCancelCheck(lever({ action: "renegotiate", basis: "pending" }))).toBe(true);
  });

  it("should never send the aggregated FX lever to the agent, since it has no supplier", () => {
    const online = { channel: "online", sourceUrl: "https://x.test", checkedAt: CHECKED_AT } as const;
    expect(cancelsOnline(lever({ id: "frais-de-change", motif: "fx", action: "switch", cancelChannel: online }))).toBe(false);
    expect(needsCancelCheck(lever({ id: "frais-de-change", motif: "fx", action: "switch" }))).toBe(false);
  });

  it("should treat our own demo portals as online without a web search", () => {
    expect(cancelsOnline(lever({ id: "nuvio", label: "Nuvio" }))).toBe(true);
    expect(needsCancelCheck(lever({ id: "nuvio", label: "Nuvio" }))).toBe(false);
  });

  it("should ask Linkup again only while the answer is missing or unknown", () => {
    expect(needsCancelCheck(lever({}))).toBe(true);
    expect(needsCancelCheck(lever({ cancelChannel: { channel: "unknown", sourceUrl: "", checkedAt: CHECKED_AT } }))).toBe(true);
    expect(needsCancelCheck(lever({ cancelChannel: { channel: "offline", sourceUrl: "https://x.test", checkedAt: CHECKED_AT } }))).toBe(false);
  });
});
