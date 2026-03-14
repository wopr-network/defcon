import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryWorkerRepo } from "../../src/worker/worker-repo.js";
import type { Worker } from "../../src/worker/types.js";

let repo: InMemoryWorkerRepo;

beforeEach(() => {
  repo = new InMemoryWorkerRepo();
});

describe("InMemoryWorkerRepo", () => {
  describe("create", () => {
    it("creates record and returns worker with generated ID", () => {
      const worker = repo.create({ type: "coder", discipline: "typescript" });
      expect(worker.id).toMatch(/^wkr_[a-f0-9]{12}$/);
      expect(worker.name).toMatch(/^auto-[a-f0-9]{8}$/);
      expect(worker.type).toBe("coder");
      expect(worker.discipline).toBe("typescript");
      expect(worker.status).toBe("idle");
      expect(worker.createdAt).toBeInstanceOf(Date);
      expect(worker.lastActivityAt).toBeInstanceOf(Date);
    });

    it("defaults type to 'unknown' when not provided", () => {
      const worker = repo.create({});
      expect(worker.type).toBe("unknown");
    });

    it("defaults discipline to null when not provided", () => {
      const worker = repo.create({});
      expect(worker.discipline).toBeNull();
    });

    it("generates unique IDs for each worker", () => {
      const w1 = repo.create({ type: "a" });
      const w2 = repo.create({ type: "b" });
      expect(w1.id).not.toBe(w2.id);
      expect(w1.name).not.toBe(w2.name);
    });

    it("sets createdAt and lastActivityAt to the same timestamp", () => {
      const worker = repo.create({ type: "coder" });
      expect(worker.createdAt.getTime()).toBe(worker.lastActivityAt.getTime());
    });
  });

  describe("get", () => {
    it("returns worker by ID after creation", () => {
      const created = repo.create({ type: "coder" });
      const found = repo.get(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.type).toBe("coder");
    });

    it("returns undefined for non-existent ID", () => {
      const found = repo.get("wkr_doesnotexist");
      expect(found).toBeUndefined();
    });

    it("returns the same object reference as stored", () => {
      const created = repo.create({ type: "reviewer" });
      const found = repo.get(created.id);
      expect(found).toBe(created);
    });
  });

  describe("touch", () => {
    it("updates lastActivityAt to a newer timestamp", async () => {
      const worker = repo.create({ type: "coder" });
      const before = worker.lastActivityAt.getTime();
      await new Promise((r) => setTimeout(r, 5));
      repo.touch(worker.id);
      const after = repo.get(worker.id)!;
      expect(after.lastActivityAt.getTime()).toBeGreaterThan(before);
    });

    it("does not modify createdAt", async () => {
      const worker = repo.create({ type: "coder" });
      const originalCreatedAt = worker.createdAt.getTime();
      await new Promise((r) => setTimeout(r, 5));
      repo.touch(worker.id);
      const after = repo.get(worker.id)!;
      expect(after.createdAt.getTime()).toBe(originalCreatedAt);
    });

    it("silently no-ops for unknown ID", () => {
      expect(() => repo.touch("wkr_nonexistent")).not.toThrow();
    });
  });

  describe("list", () => {
    it("returns empty array when no workers registered", () => {
      expect(repo.list()).toEqual([]);
    });

    it("returns all created workers", () => {
      const w1 = repo.create({ type: "coder" });
      const w2 = repo.create({ type: "reviewer" });
      const w3 = repo.create({ type: "tester" });
      const list = repo.list();
      expect(list).toHaveLength(3);
      const ids = list.map((w: Worker) => w.id);
      expect(ids).toContain(w1.id);
      expect(ids).toContain(w2.id);
      expect(ids).toContain(w3.id);
    });

    it("returns array, not the internal Map", () => {
      repo.create({ type: "coder" });
      const list = repo.list();
      expect(Array.isArray(list)).toBe(true);
    });
  });

  describe("duplicate registration", () => {
    it("creates separate workers for identical inputs (not idempotent)", () => {
      const w1 = repo.create({ type: "coder", discipline: "ts" });
      const w2 = repo.create({ type: "coder", discipline: "ts" });
      expect(w1.id).not.toBe(w2.id);
      expect(repo.list()).toHaveLength(2);
    });
  });

  describe("claim-handler usage pattern", () => {
    it("supports the get-or-create pattern used by ClaimHandler", () => {
      // First call: no worker_id — create new worker
      const worker = repo.create({ type: "coder", discipline: "ts" });
      expect(repo.get(worker.id)).toBeDefined();

      // Subsequent call: worker_id exists — touch to update activity
      repo.touch(worker.id);
      const touched = repo.get(worker.id)!;
      expect(touched.id).toBe(worker.id);

      // Unknown worker_id — get returns undefined, triggers new create
      expect(repo.get("wkr_stale123456")).toBeUndefined();
    });
  });
});
