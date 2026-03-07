import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveRunner } from "../../src/execution/active-runner.js";
import type { ActiveRunnerDeps, IAIProviderAdapter } from "../../src/execution/active-runner.js";
import type { Engine } from "../../src/engine/engine.js";
import type {
  Entity,
  Flow,
  IEntityRepository,
  IFlowRepository,
  IInvocationRepository,
  Invocation,
  State,
} from "../../src/repositories/interfaces.js";

function makeInvocation(overrides: Partial<Invocation> = {}): Invocation {
  return {
    id: "inv-1",
    entityId: "entity-1",
    stage: "review",
    mode: "active",
    prompt: "Do something",
    context: { systemPrompt: "You are a reviewer", userContent: "Please review" },
    claimedBy: "active-runner",
    claimedAt: new Date(),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    signal: null,
    artifacts: null,
    error: null,
    ttlMs: 30000,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ActiveRunnerDeps> = {}): ActiveRunnerDeps {
  return {
    engine: {
      processSignal: vi.fn().mockResolvedValue({ gated: false }),
    } as any,
    aiAdapter: {
      invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }),
    } as any,
    invocationRepo: {
      findUnclaimedActive: vi.fn().mockResolvedValue([]),
      claim: vi.fn().mockResolvedValue(makeInvocation()),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(makeInvocation()),
    } as any,
    entityRepo: {
      get: vi.fn().mockResolvedValue(null),
      updateArtifacts: vi.fn().mockResolvedValue(undefined),
    } as any,
    flowRepo: {
      get: vi.fn().mockResolvedValue(null),
      getByName: vi.fn().mockResolvedValue(null),
    } as any,
    ...overrides,
  };
}

function makeState(overrides: Partial<State> = {}): State {
  return {
    id: "state-1",
    flowId: "flow-1",
    name: "coding",
    modelTier: null,
    mode: "active",
    promptTemplate: "Do {{entity.state}}",
    constraints: null,
    onEnter: null,
    ...overrides,
  };
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "ent-1",
    flowId: "flow-1",
    state: "coding",
    refs: null,
    artifacts: null,
    claimedBy: null,
    claimedAt: null,
    flowVersion: 1,
    priority: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    affinityWorkerId: null,
    affinityRole: null,
    affinityExpiresAt: null,
    ...overrides,
  };
}

function makeFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: "flow-1",
    name: "test-flow",
    description: null,
    entitySchema: null,
    initialState: "coding",
    maxConcurrent: 0,
    maxConcurrentPerRepo: 0,
    affinityWindowMs: 300000,
    version: 1,
    createdBy: null,
    discipline: null,
    defaultModelTier: null,
    createdAt: null,
    updatedAt: null,
    states: [makeState()],
    transitions: [],
    ...overrides,
  };
}

function makeFullDeps(
  invocation: Invocation,
  entity: Entity,
  flow: Flow,
  aiAdapter: IAIProviderAdapter,
): ActiveRunnerDeps {
  return {
    engine: {
      processSignal: vi.fn().mockResolvedValue({ gated: false, terminal: true, gatesPassed: [] }),
    } as unknown as Engine,
    aiAdapter,
    invocationRepo: {
      findUnclaimedActive: vi.fn().mockResolvedValue([invocation]),
      claim: vi.fn().mockResolvedValue(invocation),
      complete: vi.fn().mockResolvedValue(invocation),
      fail: vi.fn(),
      create: vi.fn(),
    } as unknown as IInvocationRepository,
    entityRepo: { get: vi.fn().mockResolvedValue(entity), updateArtifacts: vi.fn() } as unknown as IEntityRepository,
    flowRepo: { get: vi.fn().mockResolvedValue(flow), getByName: vi.fn() } as unknown as IFlowRepository,
  };
}

function makeInvocationForModelTier(overrides: Partial<Invocation> = {}): Invocation {
  return {
    id: "inv-1",
    entityId: "ent-1",
    stage: "coding",
    mode: "active",
    prompt: "Do the thing",
    context: null,
    claimedBy: "active-runner",
    claimedAt: new Date(),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    signal: null,
    artifacts: null,
    error: null,
    ttlMs: 1800000,
    ...overrides,
  };
}

describe("sleep() abort listener cleanup", () => {
  it("removes the abort listener after normal timeout completes", async () => {
    vi.useFakeTimers();

    const controller = new AbortController();
    const signal = controller.signal;
    const removeSpy = vi.spyOn(signal, "removeEventListener");

    // Directly exercise sleep via ActiveRunner by triggering a gate-timeout re-queue
    // which calls sleep(30000, signal). Let the sleep complete normally, then verify cleanup.
    const invocation = makeInvocation({ context: null });
    const deps = makeDeps({
      invocationRepo: {
        findUnclaimedActive: vi.fn().mockResolvedValue([invocation]),
        claim: vi.fn().mockResolvedValue(invocation),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue(undefined),
      } as any,
      engine: {
        processSignal: vi.fn().mockResolvedValue({ gated: true, gateTimedOut: true }),
      } as any,
    });

    const runner = new ActiveRunner(deps);
    const runPromise = runner.run({ signal, once: true });

    // Advance past the 30s backoff so sleep completes normally (not via abort)
    await vi.advanceTimersByTimeAsync(30001);
    await runPromise;

    // The abort listener must have been removed on normal timer completion
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));

    vi.useRealTimers();
  });
});

describe("context preservation on re-queue", () => {
  it("passes original invocation context when re-queuing after gate timeout", async () => {
    const invocation = makeInvocation({
      context: { systemPrompt: "sys", userContent: "user" },
    });

    const createMock = vi.fn().mockResolvedValue(makeInvocation());
    const deps = makeDeps({
      invocationRepo: {
        findUnclaimedActive: vi.fn().mockResolvedValue([invocation]),
        claim: vi.fn().mockResolvedValue(invocation),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        create: createMock,
      } as any,
      engine: {
        processSignal: vi.fn().mockResolvedValue({ gated: true, gateTimedOut: true }),
      } as any,
    });

    vi.useFakeTimers();
    const runner = new ActiveRunner(deps);
    const controller = new AbortController();
    const runPromise = runner.run({ signal: controller.signal, once: true });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(30001);
    await runPromise.catch(() => {});
    vi.useRealTimers();

    expect(createMock).toHaveBeenCalled();
    const callArgs = createMock.mock.calls[0];
    // 6th argument is context (index 5)
    expect(callArgs[5]).toEqual({ systemPrompt: "sys", userContent: "user" });
  });

  it("passes original invocation context when re-queuing after processSignal error", async () => {
    const invocation = makeInvocation({
      context: { systemPrompt: "sys", userContent: "user" },
    });

    const createMock = vi.fn().mockResolvedValue(makeInvocation());
    const deps = makeDeps({
      invocationRepo: {
        findUnclaimedActive: vi.fn().mockResolvedValue([invocation]),
        claim: vi.fn().mockResolvedValue(invocation),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        create: createMock,
      } as any,
      engine: {
        processSignal: vi.fn().mockRejectedValue(new Error("signal processing failed")),
      } as any,
    });

    const runner = new ActiveRunner(deps);
    await runner["processInvocation"](invocation);

    expect(createMock).toHaveBeenCalled();
    const callArgs = createMock.mock.calls[0];
    // context should include original fields plus retryCount incremented from 0 to 1
    expect(callArgs[5]).toMatchObject({ systemPrompt: "sys", userContent: "user", retryCount: 1 });
  });
});

describe("maxRetries guard on processSignal error", () => {
  it("stops re-queuing after 3 processSignal errors and marks entity as stuck", async () => {
    const invocation = makeInvocation({
      context: { retryCount: 3 },
    });

    const createMock = vi.fn().mockResolvedValue(makeInvocation());
    const updateArtifactsMock = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      invocationRepo: {
        findUnclaimedActive: vi.fn().mockResolvedValue([invocation]),
        claim: vi.fn().mockResolvedValue(invocation),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        create: createMock,
      } as any,
      engine: {
        processSignal: vi.fn().mockRejectedValue(new Error("persistent error")),
      } as any,
      entityRepo: {
        get: vi.fn().mockResolvedValue(null),
        updateArtifacts: updateArtifactsMock,
      } as any,
    });

    const runner = new ActiveRunner(deps);
    await runner["processInvocation"](invocation);

    // Should NOT create a replacement invocation
    expect(createMock).not.toHaveBeenCalled();
    // Should mark the entity as stuck
    expect(updateArtifactsMock).toHaveBeenCalledWith(
      invocation.entityId,
      expect.objectContaining({ stuck: true }),
    );
  });

  it("re-queues with incremented retryCount when below max retries", async () => {
    const invocation = makeInvocation({
      context: { retryCount: 1 },
    });

    const createMock = vi.fn().mockResolvedValue(makeInvocation());
    const deps = makeDeps({
      invocationRepo: {
        findUnclaimedActive: vi.fn().mockResolvedValue([invocation]),
        claim: vi.fn().mockResolvedValue(invocation),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        create: createMock,
      } as any,
      engine: {
        processSignal: vi.fn().mockRejectedValue(new Error("transient error")),
      } as any,
    });

    const runner = new ActiveRunner(deps);
    await runner["processInvocation"](invocation);

    expect(createMock).toHaveBeenCalled();
    const callArgs = createMock.mock.calls[0];
    // context should have retryCount incremented to 2
    expect(callArgs[5]).toMatchObject({ retryCount: 2 });
  });
});

describe("ActiveRunner", () => {
  describe("resolveModel via processInvocation", () => {
    it("uses state modelTier=opus to select claude-opus-4-6", async () => {
      const state = makeState({ modelTier: "opus" });
      const flow = makeFlow({ states: [state] });
      const entity = makeEntity();
      const invocation = makeInvocationForModelTier();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const runner = new ActiveRunner(makeFullDeps(invocation, entity, flow, aiAdapter));
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "claude-opus-4-6" });
    });

    it("uses state modelTier=haiku to select claude-haiku-4-5-20251001", async () => {
      const state = makeState({ modelTier: "haiku" });
      const flow = makeFlow({ states: [state] });
      const entity = makeEntity();
      const invocation = makeInvocationForModelTier();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const runner = new ActiveRunner(makeFullDeps(invocation, entity, flow, aiAdapter));
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "claude-haiku-4-5-20251001" });
    });

    it("falls back to flow defaultModelTier when state has no modelTier", async () => {
      const state = makeState({ modelTier: null });
      const flow = makeFlow({ states: [state], defaultModelTier: "opus" });
      const entity = makeEntity();
      const invocation = makeInvocationForModelTier();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const runner = new ActiveRunner(makeFullDeps(invocation, entity, flow, aiAdapter));
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "claude-opus-4-6" });
    });

    it("falls back to DEFAULT_MODEL (sonnet) when neither state nor flow specify tier", async () => {
      const state = makeState({ modelTier: null });
      const flow = makeFlow({ states: [state], defaultModelTier: null });
      const entity = makeEntity();
      const invocation = makeInvocationForModelTier();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const runner = new ActiveRunner(makeFullDeps(invocation, entity, flow, aiAdapter));
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "claude-sonnet-4-6" });
    });

    it("uses custom modelTierMap when provided", async () => {
      const state = makeState({ modelTier: "fast" });
      const flow = makeFlow({ states: [state] });
      const entity = makeEntity();
      const invocation = makeInvocationForModelTier();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const deps = { ...makeFullDeps(invocation, entity, flow, aiAdapter), modelTierMap: { fast: "gpt-4o-mini" } };
      const runner = new ActiveRunner(deps);
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "gpt-4o-mini" });
    });

    it("state modelTier overrides flow defaultModelTier", async () => {
      const state = makeState({ modelTier: "haiku" });
      const flow = makeFlow({ states: [state], defaultModelTier: "opus" });
      const entity = makeEntity();
      const invocation = makeInvocationForModelTier();
      const aiAdapter: IAIProviderAdapter = { invoke: vi.fn().mockResolvedValue({ content: "SIGNAL: done" }) };

      const runner = new ActiveRunner(makeFullDeps(invocation, entity, flow, aiAdapter));
      await runner.run({ once: true });

      expect(aiAdapter.invoke).toHaveBeenCalledWith(invocation.prompt, { model: "claude-haiku-4-5-20251001" });
    });
  });
});
