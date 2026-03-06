import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { loadSeed } from "../../src/config/seed-loader.js";
import * as schema from "../../src/repositories/drizzle/schema.js";
import { integrationConfig } from "../../src/repositories/drizzle/schema.js";
import { DrizzleFlowRepository } from "../../src/repositories/drizzle/flow.repo.js";
import { DrizzleGateRepository } from "../../src/repositories/drizzle/gate.repo.js";

function setupDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const flowRepo = new DrizzleFlowRepository(db);
  const gateRepo = new DrizzleGateRepository(db);
  return { db, sqlite, flowRepo, gateRepo };
}

function writeSeedFile(seed: unknown): string {
  const dir = join(tmpdir(), `seed-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "seed.json");
  writeFileSync(path, JSON.stringify(seed));
  return path;
}

const validSeed = {
  flows: [{ name: "pr-review", initialState: "open" }],
  states: [
    { name: "open", flowName: "pr-review", mode: "passive", promptTemplate: "Review this PR" },
    { name: "reviewing", flowName: "pr-review" },
  ],
  gates: [{ name: "lint-pass", type: "command", command: "pnpm lint" }],
  transitions: [
    {
      flowName: "pr-review",
      fromState: "open",
      toState: "reviewing",
      trigger: "claim",
      gateName: "lint-pass",
    },
  ],
  integrations: [
    { capability: "notifications", adapter: "discord", config: { webhookUrl: "https://example.com" } },
  ],
};

describe("loadSeed", () => {
  it("loads a valid seed file and creates all records", async () => {
    const { db, sqlite, flowRepo, gateRepo } = setupDb();
    const seedPath = writeSeedFile(validSeed);

    const result = await loadSeed(seedPath, flowRepo, gateRepo, db);

    expect(result).toEqual({ flows: 1, gates: 1, integrations: 1 });

    const flow = await flowRepo.getByName("pr-review");
    expect(flow).not.toBeNull();
    expect(flow?.states).toHaveLength(2);
    expect(flow?.transitions).toHaveLength(1);
    expect(flow?.initialState).toBe("open");

    const gate = await gateRepo.getByName("lint-pass");
    expect(gate).not.toBeNull();
    expect(gate?.type).toBe("command");

    expect(flow?.transitions[0].gateId).toBe(gate?.id);

    const integrations = db.select().from(integrationConfig).all();
    expect(integrations).toHaveLength(1);
    expect(integrations[0].capability).toBe("notifications");
    expect(integrations[0].adapter).toBe("discord");

    sqlite.close();
  });

  it("rejects invalid seed file with Zod errors", async () => {
    const { db, sqlite, flowRepo, gateRepo } = setupDb();
    const seedPath = writeSeedFile({ flows: [], states: [], transitions: [] });

    await expect(loadSeed(seedPath, flowRepo, gateRepo, db)).rejects.toThrow();

    sqlite.close();
  });

  it("rejects non-existent file", async () => {
    const { db, sqlite, flowRepo, gateRepo } = setupDb();

    await expect(loadSeed("/tmp/nonexistent-seed.json", flowRepo, gateRepo, db)).rejects.toThrow();

    sqlite.close();
  });

  it("loads seed without gates or integrations", async () => {
    const { db, sqlite, flowRepo, gateRepo } = setupDb();
    const seed = {
      flows: [{ name: "simple", initialState: "start" }],
      states: [{ name: "start", flowName: "simple" }],
      transitions: [{ flowName: "simple", fromState: "start", toState: "start", trigger: "loop" }],
    };
    const seedPath = writeSeedFile(seed);

    const result = await loadSeed(seedPath, flowRepo, gateRepo, db);
    expect(result).toEqual({ flows: 1, gates: 0, integrations: 0 });

    sqlite.close();
  });
});
