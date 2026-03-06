import { beforeEach, describe, expect, it, vi } from "vitest";
import { Engine } from "../../src/engine/engine.js";

describe("reaper integration", () => {
  it("Engine.startReaper returns a stop function", () => {
    const reapExpired = vi.fn().mockResolvedValue([]);
    const reapExpiredEntity = vi.fn().mockResolvedValue(undefined);
    const engine = new Engine({
      entityRepo: { reapExpired: reapExpiredEntity } as any,
      flowRepo: {} as any,
      invocationRepo: { reapExpired } as any,
      gateRepo: {} as any,
      transitionLogRepo: {} as any,
      adapters: new Map(),
      eventEmitter: { emit: vi.fn() } as any,
    });

    const stop = engine.startReaper(60000, 300000);
    expect(typeof stop).toBe("function");
    stop();
  });
});

describe("reaper lifecycle", () => {
  it("reaper calls reapExpired on interval", async () => {
    vi.useFakeTimers();
    const reapExpired = vi.fn().mockResolvedValue([]);
    const reapExpiredEntity = vi.fn().mockResolvedValue(undefined);
    const engine = new Engine({
      entityRepo: { reapExpired: reapExpiredEntity } as any,
      flowRepo: {} as any,
      invocationRepo: { reapExpired } as any,
      gateRepo: {} as any,
      transitionLogRepo: {} as any,
      adapters: new Map(),
      eventEmitter: { emit: vi.fn() } as any,
    });

    const stop = engine.startReaper(100, 5000);

    expect(reapExpired).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(reapExpired).toHaveBeenCalledTimes(1);
    expect(reapExpiredEntity).toHaveBeenCalledWith(5000);

    await vi.advanceTimersByTimeAsync(100);
    expect(reapExpired).toHaveBeenCalledTimes(2);

    stop();

    await vi.advanceTimersByTimeAsync(200);
    expect(reapExpired).toHaveBeenCalledTimes(2); // no more calls after stop

    vi.useRealTimers();
  });
});
