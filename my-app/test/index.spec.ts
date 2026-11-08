import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("accounts worker", () => {
	it("should answer the health check with the routes it serves", async () => {
		const response = await SELF.fetch("https://example.com/health");
		expect(await response.text()).toBe("Kerdaxis accounts · POST /auth/* · POST /waitlist");
	});

	it("should no longer serve the removed MCP endpoint", async () => {
		const response = await SELF.fetch("https://example.com/mcp", { method: "POST" });
		expect(response.status).toBe(404);
	});

	it("should reject a waitlist signup with an invalid email", async () => {
		const response = await SELF.fetch("https://example.com/waitlist", {
			method: "POST",
			body: JSON.stringify({ email: "nope" }),
		});
		expect(response.status).toBe(400);
	});
});
