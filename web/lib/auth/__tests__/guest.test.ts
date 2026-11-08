import { describe, it, expect } from "vitest";
import { safeNext } from "../guest";

describe("guest trial redirect", () => {
  it("defaults to the demo and keeps internal paths", () => {
    expect(safeNext(null)).toBe("/demo");
    expect(safeNext("/demo?x=1")).toBe("/demo?x=1");
  });
  it("never redirects off-site", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "demo"]) expect(safeNext(bad)).toBe("/demo");
  });
});
