import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { bootstrap } from "../../../src/main.js";
import { DrizzleTransitionLogRepository } from "../../../src/repositories/drizzle/transition-log.repo.js";
import { flowDefinitions, entities } from "../../../src/repositories/drizzle/schema.js";

let db: BetterSQLite3Database;
let sqlite: Database.Database;
let repo: DrizzleTransitionLogRepository;

beforeEach(async () => {
  const res = bootstrap(":memory:");
  db = res.db;
  sqlite = res.sqlite;
  repo = new DrizzleTransitionLogRepository(db);

  // Seed flow + entities for FK constraints on entity_history
  await db.insert(flowDefinitions).values({
    id: "flow-1",
    name: "test-flow",
    initialState: "open",
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await db.insert(entities).values([
    {
      id: "entity-1",
      flowId: "flow-1",
      state: "open",
      priority: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "entity-2",
      flowId: "flow-1",
      state: "open",
      priority: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]);
});

afterEach(() => {
  sqlite.close();
});

describe("DrizzleTransitionLogRepository", () => {
  describe("record", () => {
    it("records a transition and returns it with an id", async () => {
      const now = new Date();
      const result = await repo.record({
        entityId: "entity-1",
        fromState: "open",
        toState: "in_progress",
        trigger: "claim",
        invocationId: null,
        timestamp: now,
      });

      expect(result.id).toBeTypeOf("string");
      expect(result.entityId).toBe("entity-1");
      expect(result.fromState).toBe("open");
      expect(result.toState).toBe("in_progress");
      expect(result.trigger).toBe("claim");
      expect(result.invocationId).toBeNull();
      expect(result.timestamp).toEqual(now);
    });

    it("records a transition with null fromState (initial transition)", async () => {
      const result = await repo.record({
        entityId: "entity-1",
        fromState: null,
        toState: "open",
        trigger: null,
        invocationId: null,
        timestamp: new Date(),
      });

      expect(result.fromState).toBeNull();
      expect(result.trigger).toBeNull();
    });
  });

  describe("historyFor", () => {
    it("returns history ordered by timestamp ascending", async () => {
      const t1 = new Date("2026-01-01T00:00:00Z");
      const t2 = new Date("2026-01-01T01:00:00Z");
      const t3 = new Date("2026-01-01T02:00:00Z");

      // Insert out of order to verify sorting
      await repo.record({
        entityId: "entity-1",
        fromState: "in_progress",
        toState: "done",
        trigger: "complete",
        invocationId: null,
        timestamp: t3,
      });
      await repo.record({
        entityId: "entity-1",
        fromState: null,
        toState: "open",
        trigger: null,
        invocationId: null,
        timestamp: t1,
      });
      await repo.record({
        entityId: "entity-1",
        fromState: "open",
        toState: "in_progress",
        trigger: "claim",
        invocationId: null,
        timestamp: t2,
      });

      const history = await repo.historyFor("entity-1");

      expect(history).toHaveLength(3);
      expect(history[0].toState).toBe("open");
      expect(history[1].toState).toBe("in_progress");
      expect(history[2].toState).toBe("done");
      expect(history[0].timestamp).toBeInstanceOf(Date);
      expect(history[0].timestamp.getTime()).toBe(t1.getTime());
      expect(history[1].timestamp.getTime()).toBe(t2.getTime());
      expect(history[2].timestamp.getTime()).toBe(t3.getTime());
    });

    it("returns only history for the requested entity", async () => {
      const now = new Date();
      await repo.record({
        entityId: "entity-1",
        fromState: null,
        toState: "open",
        trigger: null,
        invocationId: null,
        timestamp: now,
      });
      await repo.record({
        entityId: "entity-2",
        fromState: null,
        toState: "open",
        trigger: null,
        invocationId: null,
        timestamp: now,
      });

      const history1 = await repo.historyFor("entity-1");
      const history2 = await repo.historyFor("entity-2");

      expect(history1).toHaveLength(1);
      expect(history1[0].entityId).toBe("entity-1");
      expect(history2).toHaveLength(1);
      expect(history2[0].entityId).toBe("entity-2");
    });

    it("returns empty array for unknown entity", async () => {
      const history = await repo.historyFor("nonexistent");
      expect(history).toEqual([]);
    });

    it("records multiple entries for the same entity with unique ids", async () => {
      const base = Date.now();
      for (let i = 0; i < 5; i++) {
        await repo.record({
          entityId: "entity-1",
          fromState: `state-${i}`,
          toState: `state-${i + 1}`,
          trigger: `trigger-${i}`,
          invocationId: null,
          timestamp: new Date(base + i * 1000),
        });
      }

      const history = await repo.historyFor("entity-1");
      expect(history).toHaveLength(5);
      const ids = history.map((h) => h.id);
      expect(new Set(ids).size).toBe(5);
      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp.getTime()).toBeGreaterThan(history[i - 1].timestamp.getTime());
      }
    });

    it("round-trips timestamp through epoch storage", async () => {
      const ts = new Date("2026-03-07T12:34:56.000Z");
      await repo.record({
        entityId: "entity-1",
        fromState: "a",
        toState: "b",
        trigger: "go",
        invocationId: null,
        timestamp: ts,
      });

      const history = await repo.historyFor("entity-1");
      expect(history[0].timestamp.getTime()).toBe(ts.getTime());
    });
  });
});
