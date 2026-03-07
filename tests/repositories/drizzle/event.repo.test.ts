import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { bootstrap } from "../../../src/main.js";
import { DrizzleEventRepository } from "../../../src/repositories/drizzle/event.repo.js";

let db: BetterSQLite3Database;
let sqlite: Database.Database;
let repo: DrizzleEventRepository;

beforeEach(() => {
  const res = bootstrap(":memory:");
  db = res.db;
  sqlite = res.sqlite;
  repo = new DrizzleEventRepository(db);
});

afterEach(() => {
  sqlite.close();
});

describe("DrizzleEventRepository", () => {
  describe("emitDefinitionChanged", () => {
    it("inserts a definition.changed event with flowId", async () => {
      await repo.emitDefinitionChanged("flow-1", "flow.create", { name: "test-flow" });

      const rows = repo.findAll();
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe("definition.changed");
      expect(rows[0].flowId).toBe("flow-1");
      expect(rows[0].entityId).toBeNull();
      expect(rows[0].payload).toEqual({ tool: "flow.create", name: "test-flow" });
      expect(rows[0].emittedAt).toBeTypeOf("number");
      expect(rows[0].id).toBeTypeOf("string");
    });

    it("inserts a definition.changed event with null flowId", async () => {
      await repo.emitDefinitionChanged(null, "gate.create", { gateName: "lint" });

      const rows = repo.findAll();
      expect(rows).toHaveLength(1);
      expect(rows[0].flowId).toBeNull();
      expect(rows[0].payload).toEqual({ tool: "gate.create", gateName: "lint" });
    });

    it("coerces empty string flowId to null", async () => {
      await repo.emitDefinitionChanged("", "flow.update", {});

      const rows = repo.findAll();
      expect(rows).toHaveLength(1);
      expect(rows[0].flowId).toBeNull();
    });

    it("inserts multiple events with unique ids", async () => {
      await repo.emitDefinitionChanged("flow-1", "flow.create", { a: 1 });
      await repo.emitDefinitionChanged("flow-1", "state.add", { b: 2 });
      await repo.emitDefinitionChanged("flow-2", "flow.create", { c: 3 });

      const rows = repo.findAll();
      expect(rows).toHaveLength(3);
      const ids = rows.map((r) => r.id);
      expect(new Set(ids).size).toBe(3);
    });

    it("stores emittedAt as a recent timestamp", async () => {
      const before = Date.now();
      await repo.emitDefinitionChanged("flow-1", "flow.create", {});
      const after = Date.now();

      const rows = repo.findAll();
      expect(rows[0].emittedAt).toBeGreaterThanOrEqual(before);
      expect(rows[0].emittedAt).toBeLessThanOrEqual(after);
    });

    it("handles complex nested payload objects", async () => {
      const payload = { nested: { key: "value" }, arr: [1, 2, 3], flag: true };
      await repo.emitDefinitionChanged("flow-1", "flow.update", payload);

      const rows = repo.findAll();
      expect(rows[0].payload).toEqual({ tool: "flow.update", ...payload });
    });
  });
});
