import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import { HolyshipClient } from "../../src/holyship-client/client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function mockFetchError(status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: "fail" }),
  });
}

describe("HolyshipClient", () => {
  const BASE = "http://localhost:3001";

  describe("constructor", () => {
    it("sets auth header when workerToken is provided", async () => {
      const client = new HolyshipClient({ url: BASE, workerToken: "tok-123" });
      const claimBody = { next_action: "check_back", retry_after_ms: 1000, message: "none" };
      const fetchMock = mockFetchOk(claimBody);
      vi.stubGlobal("fetch", fetchMock);

      await client.claim({ role: "coder" });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer tok-123" }),
        }),
      );
    });

    it("omits auth header when workerToken is not provided", async () => {
      const client = new HolyshipClient({ url: BASE });
      const claimBody = { next_action: "check_back", retry_after_ms: 1000, message: "none" };
      const fetchMock = mockFetchOk(claimBody);
      vi.stubGlobal("fetch", fetchMock);

      await client.claim({ role: "coder" });

      const [, opts] = fetchMock.mock.calls[0];
      expect(opts.headers).toEqual({ "Content-Type": "application/json" });
    });
  });

  describe("claim()", () => {
    it("POSTs to /api/claim with role in body", async () => {
      const client = new HolyshipClient({ url: BASE, workerToken: "tok" });
      const body = {
        entity_id: "e-1",
        invocation_id: "inv-1",
        flow: "f",
        stage: "s",
        prompt: "p",
        context: null,
      };
      const fetchMock = mockFetchOk(body);
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.claim({ role: "coder" });

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/api/claim`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
          body: JSON.stringify({ role: "coder" }),
        }),
      );
      expect(result).toEqual(body);
    });

    it("POSTs to /api/flows/{flow}/claim when flow is provided", async () => {
      const client = new HolyshipClient({ url: BASE, workerToken: "tok" });
      const body = { next_action: "check_back", retry_after_ms: 5000, message: "wait" };
      const fetchMock = mockFetchOk(body);
      vi.stubGlobal("fetch", fetchMock);

      await client.claim({ role: "architect", flow: "my-flow" });

      expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/flows/my-flow/claim`, expect.any(Object));
    });

    it("URL-encodes flow name with special characters", async () => {
      const client = new HolyshipClient({ url: BASE });
      const fetchMock = mockFetchOk({
        next_action: "check_back",
        retry_after_ms: 1000,
        message: "wait",
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.claim({ role: "coder", flow: "flow/with spaces" });

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/api/flows/flow%2Fwith%20spaces/claim`,
        expect.any(Object),
      );
    });

    it("passes abort signal from opts", async () => {
      const client = new HolyshipClient({ url: BASE });
      const fetchMock = mockFetchOk({
        next_action: "check_back",
        retry_after_ms: 1000,
        message: "wait",
      });
      vi.stubGlobal("fetch", fetchMock);

      const controller = new AbortController();
      await client.claim({ role: "coder" }, { signal: controller.signal });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it("deserializes check_back response", async () => {
      const client = new HolyshipClient({ url: BASE });
      const body = {
        next_action: "check_back" as const,
        retry_after_ms: 30000,
        message: "no work",
      };
      vi.stubGlobal("fetch", mockFetchOk(body));

      const result = await client.claim({ role: "coder" });
      expect(result).toEqual(body);
    });

    it("throws on 4xx response", async () => {
      const client = new HolyshipClient({ url: BASE });
      vi.stubGlobal("fetch", mockFetchError(403));

      await expect(client.claim({ role: "coder" })).rejects.toThrow("flow.claim failed: 403");
    });

    it("throws on 5xx response", async () => {
      const client = new HolyshipClient({ url: BASE });
      vi.stubGlobal("fetch", mockFetchError(500));

      await expect(client.claim({ role: "coder" })).rejects.toThrow("flow.claim failed: 500");
    });

    it("throws on network error", async () => {
      const client = new HolyshipClient({ url: BASE });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

      await expect(client.claim({ role: "coder" })).rejects.toThrow("fetch failed");
    });
  });

  describe("createEntity()", () => {
    it("POSTs to /api/entities with flow mapped from flowName", async () => {
      const client = new HolyshipClient({ url: BASE, workerToken: "tok" });
      const fetchMock = mockFetchOk({ id: "ent-1" });
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.createEntity({ flowName: "my-flow" });

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/api/entities`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
          body: JSON.stringify({ flow: "my-flow" }),
        }),
      );
      expect(result).toEqual({ id: "ent-1" });
    });

    it("includes payload when provided", async () => {
      const client = new HolyshipClient({ url: BASE });
      const fetchMock = mockFetchOk({ id: "ent-2" });
      vi.stubGlobal("fetch", fetchMock);

      await client.createEntity({ flowName: "f", payload: { key: "val" } });

      const [, opts] = fetchMock.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body).toEqual({ flow: "f", payload: { key: "val" } });
    });

    it("omits payload key when payload is undefined", async () => {
      const client = new HolyshipClient({ url: BASE });
      const fetchMock = mockFetchOk({ id: "ent-3" });
      vi.stubGlobal("fetch", fetchMock);

      await client.createEntity({ flowName: "f" });

      const [, opts] = fetchMock.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body).toEqual({ flow: "f" });
      expect("payload" in body).toBe(false);
    });

    it("applies AbortSignal.timeout to fetch", async () => {
      const client = new HolyshipClient({ url: BASE });
      const fetchMock = mockFetchOk({ id: "ent-4" });
      vi.stubGlobal("fetch", fetchMock);

      await client.createEntity({ flowName: "f" });

      const [, opts] = fetchMock.mock.calls[0];
      expect(opts.signal).toBeDefined();
      expect(opts.signal).toBeInstanceOf(AbortSignal);
    });

    it("throws on 4xx response", async () => {
      const client = new HolyshipClient({ url: BASE });
      vi.stubGlobal("fetch", mockFetchError(422));

      await expect(client.createEntity({ flowName: "f" })).rejects.toThrow(
        "entity create failed: 422",
      );
    });

    it("throws on 5xx response", async () => {
      const client = new HolyshipClient({ url: BASE });
      vi.stubGlobal("fetch", mockFetchError(503));

      await expect(client.createEntity({ flowName: "f" })).rejects.toThrow(
        "entity create failed: 503",
      );
    });

    it("throws on network error", async () => {
      const client = new HolyshipClient({ url: BASE });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

      await expect(client.createEntity({ flowName: "f" })).rejects.toThrow("Failed to fetch");
    });
  });

  describe("report()", () => {
    it("POSTs to /api/entities/{id}/report with signal in body", async () => {
      const client = new HolyshipClient({ url: BASE, workerToken: "tok" });
      const responseBody = {
        next_action: "continue",
        new_state: "reviewing",
        prompt: "review it",
        context: null,
      };
      const fetchMock = mockFetchOk(responseBody);
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.report({ entityId: "ent-42", signal: "spec_ready" });

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/api/entities/ent-42/report`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
          body: JSON.stringify({ signal: "spec_ready" }),
        }),
      );
      expect(result).toEqual(responseBody);
    });

    it("URL-encodes entityId", async () => {
      const client = new HolyshipClient({ url: BASE });
      const fetchMock = mockFetchOk({
        next_action: "completed",
        new_state: "done",
        prompt: null,
        context: null,
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.report({ entityId: "ent/special id", signal: "done" });

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/api/entities/ent%2Fspecial%20id/report`,
        expect.any(Object),
      );
    });

    it("includes artifacts when provided", async () => {
      const client = new HolyshipClient({ url: BASE });
      const fetchMock = mockFetchOk({
        next_action: "continue",
        new_state: "s",
        prompt: "p",
        context: null,
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.report({
        entityId: "e-1",
        signal: "done",
        artifacts: { pr_url: "https://gh.com/1" },
      });

      const [, opts] = fetchMock.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body).toEqual({ signal: "done", artifacts: { pr_url: "https://gh.com/1" } });
    });

    it("omits artifacts and worker_id keys when not provided", async () => {
      const client = new HolyshipClient({ url: BASE });
      const fetchMock = mockFetchOk({
        next_action: "continue",
        new_state: "s",
        prompt: "p",
        context: null,
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.report({ entityId: "e-1", signal: "done" });

      const [, opts] = fetchMock.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body).toEqual({ signal: "done" });
      expect("artifacts" in body).toBe(false);
      expect("worker_id" in body).toBe(false);
    });

    it("maps workerId (camelCase) to worker_id (snake_case) in body", async () => {
      const client = new HolyshipClient({ url: BASE });
      const fetchMock = mockFetchOk({
        next_action: "continue",
        new_state: "s",
        prompt: "p",
        context: null,
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.report({ entityId: "e-1", signal: "done", workerId: "w-7" });

      const [, opts] = fetchMock.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.worker_id).toBe("w-7");
      expect("workerId" in body).toBe(false);
    });

    it("passes abort signal from opts", async () => {
      const client = new HolyshipClient({ url: BASE });
      const fetchMock = mockFetchOk({
        next_action: "completed",
        new_state: "done",
        prompt: null,
        context: null,
      });
      vi.stubGlobal("fetch", fetchMock);

      const controller = new AbortController();
      await client.report({ entityId: "e-1", signal: "done" }, { signal: controller.signal });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it("throws on 4xx response", async () => {
      const client = new HolyshipClient({ url: BASE });
      vi.stubGlobal("fetch", mockFetchError(404));

      await expect(client.report({ entityId: "e-1", signal: "done" })).rejects.toThrow(
        "flow.report failed: 404",
      );
    });

    it("throws on 5xx response", async () => {
      const client = new HolyshipClient({ url: BASE });
      vi.stubGlobal("fetch", mockFetchError(502));

      await expect(client.report({ entityId: "e-1", signal: "done" })).rejects.toThrow(
        "flow.report failed: 502",
      );
    });

    it("throws on network error", async () => {
      const client = new HolyshipClient({ url: BASE });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));

      await expect(client.report({ entityId: "e-1", signal: "done" })).rejects.toThrow(
        "network down",
      );
    });
  });
});
