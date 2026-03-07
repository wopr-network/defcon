import { describe, it, expect } from "vitest";
import * as schema from "../../../src/repositories/drizzle/schema.js";
import { createDatabase, bootstrap } from "../../../src/main.js";

describe("schema tables exist", () => {
  it("exports flowDefinitions table", () => {
    expect(schema.flowDefinitions).toBeDefined();
  });

  it("exports stateDefinitions table", () => {
    expect(schema.stateDefinitions).toBeDefined();
  });

  it("exports transitionRules table", () => {
    expect(schema.transitionRules).toBeDefined();
  });

  it("exports gateDefinitions table", () => {
    expect(schema.gateDefinitions).toBeDefined();
  });

  it("exports flowVersions table", () => {
    expect(schema.flowVersions).toBeDefined();
  });

  it("exports entities table", () => {
    expect(schema.entities).toBeDefined();
  });

  it("exports invocations table", () => {
    expect(schema.invocations).toBeDefined();
  });

  it("exports gateResults table", () => {
    expect(schema.gateResults).toBeDefined();
  });

  it("exports entityHistory table", () => {
    expect(schema.entityHistory).toBeDefined();
  });

  it("exports events table", () => {
    expect(schema.events).toBeDefined();
  });
});

describe("foreign keys enforcement", () => {
  it("createDatabase enables foreign_keys pragma", () => {
    const { sqlite } = createDatabase(":memory:");
    const result = sqlite.pragma("foreign_keys") as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
    sqlite.close();
  });
});

describe("migration", () => {
  it("bootstrap runs migrations without error", () => {
    const { sqlite } = bootstrap(":memory:");
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name).filter((n) => !n.startsWith("__"));
    expect(tableNames).toContain("flow_definitions");
    expect(tableNames).toContain("entities");
    expect(tableNames).toContain("events");
    expect(tableNames.length).toBeGreaterThanOrEqual(11);
    sqlite.close();
  });
});
