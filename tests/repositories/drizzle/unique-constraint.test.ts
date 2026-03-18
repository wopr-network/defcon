import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createTestDb, type TestDb } from "../../helpers/pg-test-db.js";
import { DrizzleDomainEventRepository } from "../../../src/repositories/drizzle/domain-event.repo.js";
import { DrizzleFlowRepository } from "../../../src/repositories/drizzle/flow.repo.js";
import { DrizzleGateRepository } from "../../../src/repositories/drizzle/gate.repo.js";
import { ConflictError } from "../../../src/errors.js";
import { flowDefinitions, entities } from "../../../src/repositories/drizzle/schema.js";

function makeUniqueViolationError(): Error {
  const err = new Error("duplicate key value violates unique constraint");
  (err as NodeJS.ErrnoException).code = "23505";
  return err;
}

const TENANT = "t_test";

describe("domain-event append() unique constraint handling", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let repo: DrizzleDomainEventRepository;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    await db.insert(flowDefinitions).values({
      id: "f1",
      tenantId: TENANT,
      name: "test",
      initialState: "open",
    });
    await db.insert(entities).values({
      id: "e1",
      tenantId: TENANT,
      flowId: "f1",
      state: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    repo = new DrizzleDomainEventRepository(db, TENANT);
  });

  afterEach(async () => {
    await close();
  });

  it("append() returns event on normal insert", async () => {
    const ev = await repo.append("test.event", "e1", { foo: 1 });
    expect(ev).not.toBeNull();
    expect(ev.sequence).toBe(1);
  });

  it("sequential appends increment sequence", async () => {
    const ev1 = await repo.append("test.event", "e1", { foo: 1 });
    const ev2 = await repo.append("test.event", "e1", { foo: 2 });
    expect(ev1.sequence).toBe(1);
    expect(ev2.sequence).toBe(2);
  });

  it("appendCas() returns null when a unique constraint violation occurs (concurrent write race)", async () => {
    const spy = vi.spyOn(db, "transaction").mockRejectedValueOnce(makeUniqueViolationError());
    const result = await repo.appendCas("test.event", "e1", { foo: 1 }, 0);
    expect(result).toBeNull();
    spy.mockRestore();
  });
});

describe("flow.repo unique constraint handling", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let repo: DrizzleFlowRepository;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    repo = new DrizzleFlowRepository(db, TENANT);
  });

  afterEach(async () => {
    await close();
  });

  it("create() throws ConflictError on duplicate flow name", async () => {
    await repo.create({ name: "my-flow", initialState: "open" });
    await expect(repo.create({ name: "my-flow", initialState: "open" })).rejects.toThrow(
      ConflictError,
    );
  });

  it("addState() throws ConflictError on duplicate state name in same flow", async () => {
    const flow = await repo.create({ name: "state-test", initialState: "open" });
    await repo.addState(flow.id, { name: "open" });
    await expect(repo.addState(flow.id, { name: "open" })).rejects.toThrow(ConflictError);
  });

  it("snapshot() throws ConflictError when a unique constraint violation occurs (concurrent snapshot race)", async () => {
    const flow = await repo.create({ name: "snap-flow", initialState: "open" });
    const spy = vi.spyOn(db, "transaction").mockRejectedValueOnce(makeUniqueViolationError());
    await expect(repo.snapshot(flow.id)).rejects.toThrow(ConflictError);
    spy.mockRestore();
  });
});

describe("gate.repo unique constraint handling", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let repo: DrizzleGateRepository;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    repo = new DrizzleGateRepository(db, TENANT);
  });

  afterEach(async () => {
    await close();
  });

  it("create() throws ConflictError on duplicate gate name", async () => {
    await repo.create({ name: "ci-check", type: "command", command: "echo ok" });
    await expect(
      repo.create({ name: "ci-check", type: "command", command: "echo ok" }),
    ).rejects.toThrow(ConflictError);
  });
});
