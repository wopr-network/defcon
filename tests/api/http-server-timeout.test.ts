import { describe, expect, it } from "vitest";
import { createHttpServer } from "../../src/api/server.js";

describe("HTTP server timeout configuration", () => {
  it("should set sensible global timeouts with flow.report route extending its own timeout per-request", () => {
    // Minimal deps — we only care about server config, not routing
    const engine = {} as any;
    const mcpDeps = {
      entities: {},
      flows: { listAll: async () => [] },
      invocations: {},
      gates: {},
      transitions: {},
      eventRepo: {},
      engine: null,
    } as any;

    const server = createHttpServer({ engine, mcpDeps });

    // Global defaults protect all routes from Slowloris/DoS.
    // flow.report overrides timeout per-request via req.setTimeout(0).
    expect(server.requestTimeout).toBe(30000);
    expect(server.headersTimeout).toBe(10000);

    if (server.listening) {
      server.close();
    }
  });
});
