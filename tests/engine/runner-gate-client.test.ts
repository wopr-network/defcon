import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRunnerGateHandler } from "../../src/engine/runner-gate-client.js";
import type { Entity } from "../../src/repositories/interfaces.js";

const mockFetch = vi.fn();

beforeAll(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  mockFetch.mockReset();
});

const entity: Entity = {
  id: "entity-1",
  flowId: "flow-1",
  state: "coding",
  refs: { repo: "org/repo" },
  artifacts: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  tenantId: "default",
  failureCount: 0,
  budgetCents: null,
  spentCents: 0,
  claimedBy: null,
  claimedAt: null,
};

describe("createRunnerGateHandler", () => {
  it("delegates to runner and returns outcome", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ outcome: "passed", message: "All checks passed", durationMs: 42 }),
    });

    const handler = createRunnerGateHandler({
      resolveRunnerUrl: async () => "http://runner:8080",
    });

    const result = await handler("vcs.ci_status", { ref: "abc123" }, entity);

    expect(result.outcome).toBe("passed");
    expect(result.message).toBe("All checks passed");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://runner:8080/gate",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    // Verify the body contains the right fields
    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.entityId).toBe("entity-1");
    expect(body.op).toBe("vcs.ci_status");
    expect(body.params).toEqual({ ref: "abc123" });
  });

  it("returns error when no runner available", async () => {
    const handler = createRunnerGateHandler({
      resolveRunnerUrl: async () => null,
    });

    const result = await handler("vcs.ci_status", { ref: "abc" }, entity);

    expect(result.outcome).toBe("error");
    expect(result.message).toContain("No runner available");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns error on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const handler = createRunnerGateHandler({
      resolveRunnerUrl: async () => "http://runner:8080",
    });

    const result = await handler("vcs.ci_status", { ref: "abc" }, entity);

    expect(result.outcome).toBe("error");
    expect(result.message).toContain("HTTP 500");
  });

  it("returns timeout on abort", async () => {
    mockFetch.mockImplementationOnce(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            const err = new Error("AbortError");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const handler = createRunnerGateHandler({
      resolveRunnerUrl: async () => "http://runner:8080",
      requestTimeoutMs: 50,
    });

    const result = await handler("vcs.ci_status", { ref: "abc" }, entity);

    expect(result.outcome).toBe("timeout");
    expect(result.message).toContain("timed out");
  });

  it("returns error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const handler = createRunnerGateHandler({
      resolveRunnerUrl: async () => "http://runner:8080",
    });

    const result = await handler("vcs.ci_status", { ref: "abc" }, entity);

    expect(result.outcome).toBe("error");
    expect(result.message).toContain("ECONNREFUSED");
  });
});
