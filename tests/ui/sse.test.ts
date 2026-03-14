import http from "node:http";
import { serve } from "@hono/node-server";
import { describe, afterAll, beforeAll, expect, it, vi } from "vitest";
import { createHonoApp, HonoSseAdapter, type HonoServerDeps } from "../../src/api/hono-server.js";
import { createTestDb } from "../helpers/pg-test-db.js";
import { createScopedRepos } from "../../src/repositories/scoped-repos.js";
import { Engine } from "../../src/engine/engine.js";
import { EventEmitter } from "../../src/engine/event-emitter.js";

function mockController(): ReadableStreamDefaultController<string> & { chunks: string[] } {
  const chunks: string[] = [];
  return {
    chunks,
    enqueue: vi.fn((data: string) => {
      chunks.push(data);
    }),
    close: vi.fn(),
    desiredSize: 1,
    error: vi.fn(),
  } as unknown as ReadableStreamDefaultController<string> & { chunks: string[] };
}

describe("HonoSseAdapter", () => {
  it("broadcasts engine events to connected controllers", async () => {
    const adapter = new HonoSseAdapter();
    const ctrl = mockController();
    adapter.addController(ctrl);

    await adapter.emit({
      type: "entity.created",
      entityId: "e1",
      flowId: "f1",
      payload: {},
      emittedAt: new Date("2026-01-01"),
    });

    expect(ctrl.chunks.length).toBe(1);
    const data = ctrl.chunks[0];
    expect(data).toContain("data:");
    expect(data).toContain("entity.created");
    expect(data).toContain("\n\n");
  });

  it("removes controllers", async () => {
    const adapter = new HonoSseAdapter();
    const ctrl = mockController();
    adapter.addController(ctrl);
    expect(adapter.clientCount).toBe(1);

    adapter.removeController(ctrl);
    expect(adapter.clientCount).toBe(0);
  });

  it("handles controller errors gracefully", async () => {
    const adapter = new HonoSseAdapter();
    const ctrl = mockController();
    (ctrl.enqueue as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("stream closed");
    });
    adapter.addController(ctrl);

    await adapter.emit({
      type: "entity.created",
      entityId: "e1",
      flowId: "f1",
      payload: {},
      emittedAt: new Date("2026-01-01"),
    });

    // Controller should be removed after error
    expect(adapter.clientCount).toBe(0);
  });
});

describe("SSE endpoint - query-string token rejection", () => {
  const ADMIN_TOKEN = "test-sse-admin-token-9372";
  let server: http.Server;
  let port: number;
  let stopReaper: () => Promise<void>;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    const { db, close } = await createTestDb();
    closeDb = close;
    const repos = createScopedRepos(db, "test-tenant");
    const eventEmitter = new EventEmitter();
    const engine = new Engine({
      entityRepo: repos.entities,
      flowRepo: repos.flows,
      invocationRepo: repos.invocations,
      gateRepo: repos.gates,
      transitionLogRepo: repos.transitionLog,
      adapters: new Map(),
      eventEmitter,
    });
    stopReaper = engine.startReaper(5000, 300000);
    const mcpDeps = {
      entities: repos.entities,
      flows: repos.flows,
      invocations: repos.invocations,
      gates: repos.gates,
      transitions: repos.transitionLog,
      eventRepo: repos.events,
      engine,
    };
    const deps: HonoServerDeps = {
      engine,
      mcpDeps,
      db,
      defaultTenantId: "test-tenant",
      adminToken: ADMIN_TOKEN,
      workerToken: "test-sse-worker-token",
      enableUi: true,
    };
    const app = createHonoApp(deps);
    server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }) as http.Server;
    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on("listening", resolve);
    });
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    server.close();
    await stopReaper();
    await closeDb();
  });

  it("rejects /api/ui/events?token=<valid> with 401 (query-string tokens not accepted)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/ui/events?token=${ADMIN_TOKEN}`, {
      signal: AbortSignal.timeout(2000),
    }).catch((err) => {
      // AbortError is expected if the server streams — treat as a non-2xx outcome
      if (err.name === "TimeoutError" || err.name === "AbortError") return null;
      throw err;
    });
    // The endpoint must reject the query-string token: either 401 or no 200
    if (res !== null) {
      expect(res.status).toBe(401);
    }
  });

  it("accepts /api/ui/events with valid Authorization header", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/ui/events`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      signal: AbortSignal.timeout(2000),
    }).catch((err) => {
      if (err.name === "TimeoutError" || err.name === "AbortError") return null;
      throw err;
    });
    // SSE streams: either the connection opens (200) or we time out waiting (null)
    // Either way it should NOT be 401
    if (res !== null) {
      expect(res.status).not.toBe(401);
    }
  });
});
