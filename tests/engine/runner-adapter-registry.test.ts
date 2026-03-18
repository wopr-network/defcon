import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RunnerAdapterRegistry } from "../../src/engine/runner-adapter-registry.js";

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

describe("RunnerAdapterRegistry", () => {
  it("delegates op to runner and returns result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ outcome: "passed", message: "All checks passed", durationMs: 42 }),
    });

    const registry = new RunnerAdapterRegistry({
      resolveRunnerUrl: async () => "http://runner:8080",
    });

    const result = await registry.execute("int-1", "vcs.ci_status", { ref: "abc123" });

    expect(result.outcome).toBe("passed");
    expect(result.message).toBe("All checks passed");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://runner:8080/gate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns error when no runner available", async () => {
    const registry = new RunnerAdapterRegistry({
      resolveRunnerUrl: async () => null,
    });

    const result = await registry.execute("int-1", "vcs.ci_status", { ref: "abc" });

    expect(result.outcome).toBe("error");
    expect(result.message).toContain("No runner available");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns error on HTTP failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const registry = new RunnerAdapterRegistry({
      resolveRunnerUrl: async () => "http://runner:8080",
    });

    const result = await registry.execute("int-1", "vcs.ci_status", { ref: "abc" });

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

    const registry = new RunnerAdapterRegistry({
      resolveRunnerUrl: async () => "http://runner:8080",
      requestTimeoutMs: 50,
    });

    const result = await registry.execute("int-1", "vcs.ci_status", { ref: "abc" });

    expect(result.outcome).toBe("timeout");
  });

  it("strips trailing slash from runner URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ outcome: "passed" }),
    });

    const registry = new RunnerAdapterRegistry({
      resolveRunnerUrl: async () => "http://runner:8080/",
    });

    await registry.execute("int-1", "vcs.ci_status", { ref: "abc" });

    expect(mockFetch).toHaveBeenCalledWith("http://runner:8080/gate", expect.anything());
  });

  it("forwards caller abort signal", async () => {
    const callerController = new AbortController();
    // Abort before calling execute — tests the already-aborted path
    callerController.abort();

    mockFetch.mockImplementationOnce((_url: string, opts: { signal: AbortSignal }) => {
      // Signal should already be aborted
      const err = new Error("AbortError");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    const registry = new RunnerAdapterRegistry({
      resolveRunnerUrl: async () => "http://runner:8080",
      requestTimeoutMs: 60_000,
    });

    const result = await registry.execute(
      "int-1",
      "vcs.ci_status",
      { ref: "abc" },
      callerController.signal,
    );
    expect(result.outcome).toBe("timeout");
  });
});
