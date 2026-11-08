import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChanges, getSession, HaiError, MAX_ATTEMPTS, pauseSession, REQUEST_TIMEOUT_MS, sendMessage } from "../hcompany";

type Reply = Response | Error;

function json(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function timeoutError(): Error {
  const err = new Error("The operation was aborted due to timeout");
  err.name = "TimeoutError";
  return err;
}

describe("H Company client (timeouts and retries)", () => {
  let replies: Reply[];
  let calls: { url: string; init: RequestInit }[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    process.env.HAI_API_KEY = "test-key";
    replies = [];
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        const next = replies.shift() ?? json(200);
        if (next instanceof Error) throw next;
        return next;
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Lets the backoff sleeps elapse, then returns the call's outcome. */
  async function settle<T>(promise: Promise<T>): Promise<T> {
    const outcome = promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await vi.runAllTimersAsync();
    const result = await outcome;
    if ("error" in result) throw result.error;
    return result.value;
  }

  it("should retry a read after a 503 and return the session", async () => {
    replies = [json(503), json(200, { id: "s1" })];
    await expect(settle(getSession("s1"))).resolves.toEqual({ id: "s1" });
    expect(calls).toHaveLength(2);
  });

  it("should retry a read after a timeout or a network error", async () => {
    replies = [timeoutError(), new TypeError("fetch failed"), json(200, { id: "s1" })];
    await expect(settle(getSession("s1"))).resolves.toEqual({ id: "s1" });
    expect(calls).toHaveLength(3);
  });

  it("should give up after MAX_ATTEMPTS with a typed error that never carries the key", async () => {
    replies = Array.from({ length: MAX_ATTEMPTS }, () => json(502, { detail: "bad gateway" }));
    const error = await settle(getSession("s1")).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(HaiError);
    expect((error as HaiError).status).toBe(502);
    expect((error as HaiError).message).not.toContain("test-key");
    expect(calls).toHaveLength(MAX_ATTEMPTS);
  });

  it("should report a timeout as a 504 HaiError", async () => {
    replies = Array.from({ length: MAX_ATTEMPTS }, timeoutError);
    const error = await settle(getSession("s1")).catch((err: unknown) => err);
    expect(error).toMatchObject({ status: 504, code: "timeout" });
  });

  it("should never retry a client error", async () => {
    replies = [json(404, { detail: "not found" })];
    await expect(settle(getSession("s1"))).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(1);
  });

  it("should not resend a message after a network error, the go may already be queued", async () => {
    replies = [new TypeError("fetch failed")];
    await expect(settle(sendMessage("s1", "APPROVED"))).rejects.toMatchObject({ code: "network_error" });
    expect(calls).toHaveLength(1);
  });

  it("should not resend a message after a 500", async () => {
    replies = [json(500)];
    await expect(settle(sendMessage("s1", "APPROVED"))).rejects.toMatchObject({ status: 500 });
    expect(calls).toHaveLength(1);
  });

  it("should resend a message refused with 429, honouring Retry-After", async () => {
    replies = [json(429, {}, { "retry-after": "2" }), new Response(null, { status: 202 })];
    await expect(settle(sendMessage("s1", "APPROVED"))).resolves.toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("should retry a pause, which is safe to replay", async () => {
    replies = [json(503), new Response(null, { status: 202 })];
    await expect(settle(pauseSession("s1"))).resolves.toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("should give the long-poll its wait time on top of the request timeout", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    replies = [new Response(null, { status: 204 })];
    await expect(settle(getChanges("s1", 0, 5))).resolves.toBeNull();
    expect(timeoutSpy).toHaveBeenCalledWith(5_000 + REQUEST_TIMEOUT_MS);
    timeoutSpy.mockRestore();
  });
});
