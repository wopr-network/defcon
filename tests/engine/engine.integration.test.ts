import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { EngineEvent, IEventBusAdapter } from "../../src/engine/event-types.js";
import { Engine } from "../../src/engine/engine.js";
import {
  DrizzleEntityRepository,
  DrizzleEventRepository,
  DrizzleFlowRepository,
  DrizzleGateRepository,
  DrizzleInvocationRepository,
  DrizzleTransitionLogRepository,
} from "../../src/repositories/drizzle/index.js";
import * as schema from "../../src/repositories/drizzle/schema.js";
import { loadSeed } from "../../src/config/seed-loader.js";
import { callToolHandler } from "../../src/execution/mcp-server.js";
import type { McpServerDeps } from "../../src/execution/mcp-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function setupEngine() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });

  const events: EngineEvent[] = [];
  const eventEmitter: IEventBusAdapter = {
    emit: async (e) => {
      events.push(e);
    },
  };

  const entityRepo = new DrizzleEntityRepository(db);
  const flowRepo = new DrizzleFlowRepository(db);
  const invocationRepo = new DrizzleInvocationRepository(db);
  const gateRepo = new DrizzleGateRepository(db);
  const transitionLogRepo = new DrizzleTransitionLogRepository(db);
  const eventRepo = new DrizzleEventRepository(db);

  const engine = new Engine({
    entityRepo,
    flowRepo,
    invocationRepo,
    gateRepo,
    transitionLogRepo,
    adapters: new Map(),
    eventEmitter,
  });

  return {
    sqlite,
    db,
    events,
    engine,
    entityRepo,
    flowRepo,
    invocationRepo,
    gateRepo,
    transitionLogRepo,
    eventRepo,
  };
}

describe("Engine integration (in-memory SQLite)", () => {
  let ctx: ReturnType<typeof setupEngine>;

  beforeEach(() => {
    ctx = setupEngine();
  });

  afterEach(() => {
    ctx.sqlite.close();
  });

  it("in-memory SQLite migrations run without error", () => {
    expect(ctx.sqlite.open).toBe(true);
  });

  it("happy path: seed load → entity create → signal through to terminal", async () => {
    const seedPath = resolve(__dirname, "fixtures/simple-flow.seed.json");
    const seedResult = await loadSeed(seedPath, ctx.flowRepo, ctx.gateRepo, ctx.sqlite);
    expect(seedResult.flows).toBe(1);

    const entity = await ctx.engine.createEntity("simple-pipeline");
    expect(entity.state).toBe("backlog");

    const r1 = await ctx.engine.processSignal(entity.id, "assigned");
    expect(r1.newState).toBe("coding");
    expect(r1.gated).toBe(false);
    expect(r1.terminal).toBe(false);
    expect(r1.invocationId).toBeDefined();

    const r2 = await ctx.engine.processSignal(entity.id, "completed");
    expect(r2.newState).toBe("done");
    expect(r2.terminal).toBe(true);
    expect(r2.invocationId).toBeUndefined();

    const history = await ctx.transitionLogRepo.historyFor(entity.id);
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.toState)).toEqual(["coding", "done"]);

    const transitionEvents = ctx.events.filter((e) => e.type === "entity.transitioned");
    expect(transitionEvents).toHaveLength(2);

    const finalEntity = await ctx.entityRepo.get(entity.id);
    expect(finalEntity!.state).toBe("done");
  });

  it("gate evaluation: gate blocks → update gate → gate passes", async () => {
    const seedPath = resolve(__dirname, "fixtures/gated-flow.seed.json");
    await loadSeed(seedPath, ctx.flowRepo, ctx.gateRepo, ctx.sqlite);

    const entity = await ctx.engine.createEntity("gated-pipeline");
    expect(entity.state).toBe("coding");

    const r1 = await ctx.engine.processSignal(entity.id, "submit");
    expect(r1.gated).toBe(true);
    expect(r1.newState).toBeUndefined();
    expect(r1.gateName).toBe("score-check");

    const blockedEntity = await ctx.entityRepo.get(entity.id);
    expect(blockedEntity!.state).toBe("coding");
    const failures = blockedEntity!.artifacts?.gate_failures as Array<Record<string, unknown>>;
    expect(failures).toHaveLength(1);
    expect(failures[0].gateName).toBe("score-check");

    const gateFailEvents = ctx.events.filter((e) => e.type === "gate.failed");
    expect(gateFailEvents).toHaveLength(1);

    const gates = await ctx.gateRepo.listAll();
    const scoreGate = gates.find((g) => g.name === "score-check")!;
    await ctx.gateRepo.update(scoreGate.id, { command: "gates/test-pass.sh" });

    const r2 = await ctx.engine.processSignal(entity.id, "submit");
    expect(r2.gated).toBe(false);
    expect(r2.newState).toBe("reviewing");

    const gatePassEvents = ctx.events.filter((e) => e.type === "gate.passed");
    expect(gatePassEvents).toHaveLength(1);

    const gateResults = await ctx.gateRepo.resultsFor(entity.id);
    expect(gateResults.length).toBeGreaterThanOrEqual(2);
    expect(gateResults.some((r) => r.passed)).toBe(true);
  });

  it("multi-entity concurrency: 10 entities reach correct states independently", async () => {
    const seedPath = resolve(__dirname, "fixtures/simple-flow.seed.json");
    await loadSeed(seedPath, ctx.flowRepo, ctx.gateRepo, ctx.sqlite);

    const entities = await Promise.all(Array.from({ length: 10 }, () => ctx.engine.createEntity("simple-pipeline")));
    expect(entities).toHaveLength(10);
    for (const e of entities) {
      expect(e.state).toBe("backlog");
    }

    const r1s = await Promise.all(entities.map((e) => ctx.engine.processSignal(e.id, "assigned")));
    for (const r of r1s) {
      expect(r.newState).toBe("coding");
    }

    const r2s = await Promise.all(entities.map((e) => ctx.engine.processSignal(e.id, "completed")));
    for (const r of r2s) {
      expect(r.newState).toBe("done");
      expect(r.terminal).toBe(true);
    }

    for (const e of entities) {
      const final = await ctx.entityRepo.get(e.id);
      expect(final!.state).toBe("done");
    }

    const transitionEvents = ctx.events.filter((e) => e.type === "entity.transitioned");
    expect(transitionEvents).toHaveLength(20);
  });

  it("spawn flow: parent terminal transition spawns child entity", async () => {
    const seedPath = resolve(__dirname, "fixtures/spawn-flow.seed.json");
    await loadSeed(seedPath, ctx.flowRepo, ctx.gateRepo, ctx.sqlite);

    const parentEntity = await ctx.engine.createEntity("parent-flow");
    expect(parentEntity.state).toBe("working");

    const result = await ctx.engine.processSignal(parentEntity.id, "finish");
    expect(result.newState).toBe("completed");
    expect(result.terminal).toBe(true);
    expect(result.spawned).toBeDefined();
    expect(result.spawned).toHaveLength(1);

    const spawnEvents = ctx.events.filter((e) => e.type === "flow.spawned");
    expect(spawnEvents).toHaveLength(1);

    const childFlow = await ctx.flowRepo.getByName("child-flow");
    expect(childFlow).not.toBeNull();
    const childEntities = await ctx.entityRepo.findByFlowAndState(childFlow!.id, "pending");
    expect(childEntities).toHaveLength(1);

    const childResult = await ctx.engine.processSignal(childEntities[0].id, "process");
    expect(childResult.newState).toBe("child-done");
    expect(childResult.terminal).toBe(true);
  });

  it("MCP flow: claim → get_prompt → report through to terminal via callToolHandler", async () => {
    const seedPath = resolve(__dirname, "fixtures/simple-flow.seed.json");
    await loadSeed(seedPath, ctx.flowRepo, ctx.gateRepo, ctx.sqlite);

    const entity = await ctx.engine.createEntity("simple-pipeline");
    const r1 = await ctx.engine.processSignal(entity.id, "assigned");
    expect(r1.newState).toBe("coding");
    expect(r1.invocationId).toBeDefined();

    const mcpDeps: McpServerDeps = {
      entities: ctx.entityRepo,
      flows: ctx.flowRepo,
      invocations: ctx.invocationRepo,
      gates: ctx.gateRepo,
      transitions: ctx.transitionLogRepo,
      eventRepo: ctx.eventRepo,
      engine: ctx.engine,
    };

    const claimResult = await callToolHandler(mcpDeps, "flow.claim", { role: "coder" });
    expect(claimResult.isError).toBeUndefined();
    const claimData = JSON.parse(claimResult.content[0].text) as {
      entity_id: string;
      invocation_id: string;
      prompt: string;
    } | null;
    expect(claimData).not.toBeNull();
    expect(claimData!.entity_id).toBe(entity.id);
    expect(claimData!.invocation_id).toBeDefined();
    expect(claimData!.prompt).toContain(entity.id);

    const promptResult = await callToolHandler(mcpDeps, "flow.get_prompt", { entity_id: entity.id });
    expect(promptResult.isError).toBeUndefined();
    const promptData = JSON.parse(promptResult.content[0].text) as { prompt: string };
    expect(promptData.prompt).toBeDefined();

    const reportResult = await callToolHandler(mcpDeps, "flow.report", {
      entity_id: entity.id,
      signal: "completed",
      artifacts: { result: "success" },
    });
    expect(reportResult.isError).toBeUndefined();
    const reportData = JSON.parse(reportResult.content[0].text) as {
      new_state: string;
      next_action: string;
    };
    expect(reportData.new_state).toBe("done");
    expect(reportData.next_action).toBe("completed");

    const finalEntity = await ctx.entityRepo.get(entity.id);
    expect(finalEntity!.state).toBe("done");
  });
});
