import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "../../src/pool/pool.js";

describe("Pool", () => {
  describe("allocate", () => {
    it("returns a Slot when capacity is available", () => {
      const pool = new Pool(2);
      const slot = pool.allocate("s1", "w1", "engineering", "entity-1", "do work");
      expect(slot).not.toBeNull();
      expect(slot!.slotId).toBe("s1");
      expect(slot!.workerId).toBe("w1");
      expect(slot!.discipline).toBe("engineering");
      expect(slot!.entityId).toBe("entity-1");
      expect(slot!.state).toBe("claimed");
      expect(slot!.prompt).toBe("do work");
      expect(slot!.result).toBeNull();
      expect(slot!.flowName).toBeNull();
      expect(slot!.repo).toBeNull();
      expect(slot!.lastHeartbeat).toBeGreaterThan(0);
    });

    it("stores flowName and repo when provided", () => {
      const pool = new Pool(1);
      const slot = pool.allocate("s1", "w1", "engineering", "e1", "p", "my-flow", "my-repo");
      expect(slot).not.toBeNull();
      expect(slot!.flowName).toBe("my-flow");
      expect(slot!.repo).toBe("my-repo");
    });

    it("returns null when pool is at capacity", () => {
      const pool = new Pool(1);
      pool.allocate("s1", "w1", "engineering", "e1", "p1");
      const slot2 = pool.allocate("s2", "w2", "engineering", "e2", "p2");
      expect(slot2).toBeNull();
    });

    it("throws when allocating a duplicate slotId", () => {
      const pool = new Pool(2);
      pool.allocate("s1", "w1", "engineering", "e1", "p1");
      expect(() => pool.allocate("s1", "w2", "engineering", "e2", "p2")).toThrow(
        "Slot already allocated: s1",
      );
    });
  });

  describe("release", () => {
    it("frees the slot so capacity is restored", () => {
      const pool = new Pool(1);
      pool.allocate("s1", "w1", "engineering", "e1", "p");
      expect(pool.availableSlots()).toBe(0);
      pool.release("s1");
      expect(pool.availableSlots()).toBe(1);
    });

    it("allows a new allocation after release", () => {
      const pool = new Pool(1);
      pool.allocate("s1", "w1", "engineering", "e1", "p");
      pool.release("s1");
      const slot = pool.allocate("s2", "w2", "engineering", "e2", "p2");
      expect(slot).not.toBeNull();
      expect(slot!.slotId).toBe("s2");
    });

    it("throws on unknown slotId", () => {
      const pool = new Pool(1);
      expect(() => pool.release("nonexistent")).toThrow("Unknown slot: nonexistent");
    });

    it("throws when releasing the same slot twice", () => {
      const pool = new Pool(1);
      pool.allocate("s1", "w1", "engineering", "e1", "p");
      pool.release("s1");
      expect(() => pool.release("s1")).toThrow("Unknown slot: s1");
    });
  });

  describe("capacity and slot counting", () => {
    it("getCapacity returns the configured capacity", () => {
      const pool = new Pool(4);
      expect(pool.getCapacity()).toBe(4);
    });

    it("availableSlots decreases with each allocation", () => {
      const pool = new Pool(3);
      expect(pool.availableSlots()).toBe(3);
      pool.allocate("s1", "w1", "eng", "e1", "p");
      expect(pool.availableSlots()).toBe(2);
      pool.allocate("s2", "w2", "eng", "e2", "p");
      expect(pool.availableSlots()).toBe(1);
      pool.allocate("s3", "w3", "eng", "e3", "p");
      expect(pool.availableSlots()).toBe(0);
    });

    it("availableSlots never goes below zero", () => {
      const pool = new Pool(0);
      expect(pool.availableSlots()).toBe(0);
    });

    it("activeSlots returns all currently allocated slots", () => {
      const pool = new Pool(3);
      expect(pool.activeSlots()).toEqual([]);
      pool.allocate("s1", "w1", "eng", "e1", "p");
      pool.allocate("s2", "w2", "ops", "e2", "p");
      const active = pool.activeSlots();
      expect(active).toHaveLength(2);
      expect(active.map((s) => s.slotId).sort()).toEqual(["s1", "s2"]);
    });

    it("activeSlots excludes released slots", () => {
      const pool = new Pool(2);
      pool.allocate("s1", "w1", "eng", "e1", "p");
      pool.allocate("s2", "w2", "eng", "e2", "p");
      pool.release("s1");
      const active = pool.activeSlots();
      expect(active).toHaveLength(1);
      expect(active[0].slotId).toBe("s2");
    });
  });

  describe("heartbeat", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("updates lastHeartbeat timestamp", () => {
      const pool = new Pool(1);
      const slot = pool.allocate("s1", "w1", "eng", "e1", "p")!;
      const before = slot.lastHeartbeat;
      vi.advanceTimersByTime(10);
      pool.heartbeat("s1");
      expect(slot.lastHeartbeat).toBeGreaterThan(before);
    });

    it("is a no-op for unknown slotId (does not throw)", () => {
      const pool = new Pool(1);
      expect(() => pool.heartbeat("nonexistent")).not.toThrow();
    });
  });

  describe("complete", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sets result and transitions state to reporting", () => {
      const pool = new Pool(1);
      pool.allocate("s1", "w1", "eng", "e1", "p");
      const result = { signal: "pr_created", artifacts: { pr: 42 }, exitCode: 0 };
      pool.complete("s1", result);
      const slots = pool.activeSlots();
      expect(slots[0].state).toBe("reporting");
      expect(slots[0].result).toEqual(result);
    });

    it("updates lastHeartbeat on complete", () => {
      const pool = new Pool(1);
      const slot = pool.allocate("s1", "w1", "eng", "e1", "p")!;
      const before = slot.lastHeartbeat;
      vi.advanceTimersByTime(10);
      pool.complete("s1", { signal: "done", artifacts: {}, exitCode: 0 });
      expect(slot.lastHeartbeat).toBeGreaterThan(before);
    });

    it("throws on unknown slotId", () => {
      const pool = new Pool(1);
      expect(() =>
        pool.complete("nonexistent", { signal: "done", artifacts: {}, exitCode: 0 }),
      ).toThrow("Unknown slot: nonexistent");
    });
  });

  describe("setState", () => {
    it("transitions slot to the given state", () => {
      const pool = new Pool(1);
      pool.allocate("s1", "w1", "eng", "e1", "p");
      pool.setState("s1", "working");
      expect(pool.activeSlots()[0].state).toBe("working");
      pool.setState("s1", "reporting");
      expect(pool.activeSlots()[0].state).toBe("reporting");
    });

    it("throws on unknown slotId", () => {
      const pool = new Pool(1);
      expect(() => pool.setState("nonexistent", "working")).toThrow(
        "Unknown slot: nonexistent",
      );
    });
  });

  describe("activeCountByFlow", () => {
    it("counts slots belonging to a specific flow", () => {
      const pool = new Pool(4);
      pool.allocate("s1", "w1", "eng", "e1", "p", "flow-a");
      pool.allocate("s2", "w2", "eng", "e2", "p", "flow-a");
      pool.allocate("s3", "w3", "eng", "e3", "p", "flow-b");
      expect(pool.activeCountByFlow("flow-a")).toBe(2);
      expect(pool.activeCountByFlow("flow-b")).toBe(1);
      expect(pool.activeCountByFlow("flow-c")).toBe(0);
    });

    it("returns 0 when no slots are allocated", () => {
      const pool = new Pool(2);
      expect(pool.activeCountByFlow("any")).toBe(0);
    });

    it("decrements when a slot with that flow is released", () => {
      const pool = new Pool(2);
      pool.allocate("s1", "w1", "eng", "e1", "p", "flow-a");
      pool.allocate("s2", "w2", "eng", "e2", "p", "flow-a");
      pool.release("s1");
      expect(pool.activeCountByFlow("flow-a")).toBe(1);
    });
  });

  describe("activeCountByRepo", () => {
    it("counts slots matching both flow and repo", () => {
      const pool = new Pool(4);
      pool.allocate("s1", "w1", "eng", "e1", "p", "flow-a", "repo-x");
      pool.allocate("s2", "w2", "eng", "e2", "p", "flow-a", "repo-x");
      pool.allocate("s3", "w3", "eng", "e3", "p", "flow-a", "repo-y");
      pool.allocate("s4", "w4", "eng", "e4", "p", "flow-b", "repo-x");
      expect(pool.activeCountByRepo("flow-a", "repo-x")).toBe(2);
      expect(pool.activeCountByRepo("flow-a", "repo-y")).toBe(1);
      expect(pool.activeCountByRepo("flow-b", "repo-x")).toBe(1);
      expect(pool.activeCountByRepo("flow-b", "repo-y")).toBe(0);
    });

    it("returns 0 when no slots are allocated", () => {
      const pool = new Pool(2);
      expect(pool.activeCountByRepo("any", "any")).toBe(0);
    });
  });

  describe("concurrent allocate contention", () => {
    it("only one of two allocates succeeds when one slot remains", () => {
      const pool = new Pool(1);
      const result1 = pool.allocate("s1", "w1", "eng", "e1", "p1");
      const result2 = pool.allocate("s2", "w2", "eng", "e2", "p2");
      expect(result1).not.toBeNull();
      expect(result2).toBeNull();
      expect(pool.availableSlots()).toBe(0);
      expect(pool.activeSlots()).toHaveLength(1);
    });

    it("filling pool to exact capacity then one more returns null", () => {
      const pool = new Pool(3);
      const results = [];
      for (let i = 0; i < 4; i++) {
        results.push(pool.allocate(`s${i}`, `w${i}`, "eng", `e${i}`, `p${i}`));
      }
      expect(results.filter((r) => r !== null)).toHaveLength(3);
      expect(results[3]).toBeNull();
    });
  });

  describe("zero-capacity pool", () => {
    it("always returns null on allocate", () => {
      const pool = new Pool(0);
      const slot = pool.allocate("s1", "w1", "eng", "e1", "p");
      expect(slot).toBeNull();
    });

    it("reports 0 available and 0 active slots", () => {
      const pool = new Pool(0);
      expect(pool.availableSlots()).toBe(0);
      expect(pool.activeSlots()).toEqual([]);
      expect(pool.getCapacity()).toBe(0);
    });
  });
});
