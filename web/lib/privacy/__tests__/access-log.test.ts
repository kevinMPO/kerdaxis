import { describe, expect, it } from "vitest";
import { accessScopeFor, listAccess, recordAccess, withAccessScope } from "../access-log";

const requestWithCookie = (cookie?: string): Request =>
  new Request("http://localhost/api/test", cookie ? { headers: { cookie } } : undefined);

describe("access log", () => {
  it("should scope entries to the visitor's session cookie", async () => {
    const alice = requestWithCookie("kx_session=alice-token");
    const bob = requestWithCookie("kx_session=bob-token");

    await withAccessScope(alice, () => recordAccess({ service: "linkup", operation: "price search", direction: "sent", sent: "Figma · design" }));
    await withAccessScope(bob, () => recordAccess({ service: "qonto", operation: "list_transactions", direction: "read" }));

    const aliceEntries = await listAccess(await accessScopeFor(alice));
    const bobEntries = await listAccess(await accessScopeFor(bob));

    expect(aliceEntries.map((e) => e.operation)).toContain("price search");
    expect(aliceEntries.map((e) => e.operation)).not.toContain("list_transactions");
    expect(bobEntries.map((e) => e.operation)).toEqual(["list_transactions"]);
  });

  it("should never store the session cookie itself as the scope", async () => {
    const scope = await accessScopeFor(requestWithCookie("kx_session=secret-value"));
    expect(scope).not.toContain("secret");
    expect(scope).toMatch(/^[0-9a-f]{16}$/);
  });

  it("should fall back to the local scope when there is no session cookie", async () => {
    expect(await accessScopeFor(requestWithCookie())).toBe("local");
  });

  it("should redact personal data from the sent summary", async () => {
    const carol = requestWithCookie("kx_session=carol-token");
    await withAccessScope(carol, () =>
      recordAccess({ service: "anthropic", operation: "letter", direction: "sent", sent: "Nuvio · FR7630006000011234567890189 · jane@example.com" }),
    );
    const [entry] = await listAccess(await accessScopeFor(carol));
    expect(entry.sent).not.toContain("FR7630006000011234567890189");
    expect(entry.sent).not.toContain("jane@example.com");
    expect(entry.sent).toContain("Nuvio");
  });

  it("should keep nothing in the sent field for a read", async () => {
    const dave = requestWithCookie("kx_session=dave-token");
    await withAccessScope(dave, () => recordAccess({ service: "qonto", operation: "get_organization", direction: "read", sent: "ignored" }));
    const [entry] = await listAccess(await accessScopeFor(dave));
    expect(entry.sent).toBeNull();
  });
});
