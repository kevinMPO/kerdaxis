import { describe, expect, it } from "vitest";

import { advanceReplay, decideReplay, startReplay } from "../replay";
import { AGENT_INSTRUCTIONS } from "../runner";
import { runCopy, runLangOf } from "../run-copy";
import { RECORDINGS } from "../replay-recordings";
import type { Approval } from "../policy";

const approval = {
  id: "00000000-0000-4000-8000-000000000001",
  actionHash: "abcdef0123456789",
  channel: "ui",
  params: { supplierId: "nuvio", vendor: "Nuvio CRM", plan: "Growth", account: "ACME", monthlyCents: 12900 },
} as unknown as Approval;

const FAR_FUTURE_MS = 10 * 60_000;

function fullReplay(lang: "fr" | "en", supplierId = "nuvio"): string[] {
  const exec = startReplay({ ...approval, params: { ...approval.params, supplierId } }, lang);
  advanceReplay(exec, exec.replay!.startedMs + FAR_FUTURE_MS);
  decideReplay(exec, "approve");
  advanceReplay(exec, exec.replay!.goMs! + FAR_FUTURE_MS);
  return exec.events.map((e) => e.message);
}

describe("run log language", () => {
  it("should map the interface language to a log language, falling back to English", () => {
    expect(runLangOf("fr")).toBe("fr");
    expect(runLangOf("en")).toBe("en");
    expect(runLangOf("de")).toBe("en");
    expect(runLangOf(undefined)).toBe("en");
  });

  it("should define the same messages in French and English", () => {
    const fr = runCopy("fr");
    const en = runCopy("en");
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(Object.values(RECORDINGS))("should give the $supplierId replay one text per recorded step in both languages", (recording) => {
    for (const lang of ["fr", "en"] as const) {
      expect(recording.copy[lang].before).toHaveLength(recording.before.length);
      expect(recording.copy[lang].after).toHaveLength(recording.after.length);
    }
  });

  it.each(Object.keys(RECORDINGS))("should write the whole %s replay in French when launched in French", (supplierId) => {
    const messages = fullReplay("fr", supplierId);
    expect(messages).toContain(RECORDINGS[supplierId].copy.fr.intro);
    expect(messages).toContain(runCopy("fr").finalGiven);
    expect(messages).toContain(RECORDINGS[supplierId].copy.fr.verified);
    for (const message of messages) expect(message).not.toMatch(/\b(the agent|Final go|Supplier portal)\b/);
  });

  it.each(Object.keys(RECORDINGS))("should write the whole %s replay in English when launched in English", (supplierId) => {
    const messages = fullReplay("en", supplierId);
    expect(messages).toContain(RECORDINGS[supplierId].copy.en.intro);
    for (const message of messages) expect(message).not.toMatch(/\b(feu vert|l'agent|Rediffusion)\b/);
  });

  it("should tell the agent which language to write its notes in", () => {
    expect(AGENT_INSTRUCTIONS("Nuvio CRM", "ACME", "portal.kerdaxis.com", runCopy("fr").agentLanguage)).toContain("in French");
    expect(AGENT_INSTRUCTIONS("Nuvio CRM", "ACME", "portal.kerdaxis.com", runCopy("en").agentLanguage)).toContain("in English");
  });
});
