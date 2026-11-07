import { beforeAll, describe, expect, it } from "vitest";
import { issueSession, normalizeEmail, verifySession } from "../user-session";

beforeAll(() => {
  process.env.KERDAXIS_SESSION_SECRET = "test-secret-at-least-16-chars";
});

describe("session utilisateur signée", () => {
  it("relit un cookie d'essai valide", async () => {
    const c = await issueSession("trial", "a@b.co");
    expect(await verifySession(c)).toMatchObject({ role: "trial", email: "a@b.co" });
  });
  it("refuse un rôle falsifié (signature)", async () => {
    const c = await issueSession("trial", "a@b.co");
    const [, sig] = c.split(".");
    const forged = Buffer.from(JSON.stringify({ r: "member", e: "a@b.co", x: 9999999999 })).toString("base64url");
    expect(await verifySession(`${forged}.${sig}`)).toBeNull();
  });
  it("refuse un cookie expiré", async () => {
    const c = await issueSession("member", "a@b.co", Date.now() - 30 * 24 * 3600 * 1000);
    expect(await verifySession(c)).toBeNull();
  });
  it("normalise et valide l'e-mail", () => {
    expect(normalizeEmail("  Kev@Example.COM ")).toBe("kev@example.com");
    expect(normalizeEmail("nope")).toBeNull();
  });
});
