import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LitestreamManager } from "../../src/litestream/manager.js";

const mockConfig = {
  dbPath: "/data/test.db",
  replicaUrl: "s3://bucket/path",
  accessKeyId: "AKID",
  secretAccessKey: "secret",
  region: "us-east-1",
  retention: "24h",
  syncInterval: "1s",
};

describe("LitestreamManager", () => {
  describe("generateConfig", () => {
    it("escapes single quotes in config values", () => {
      const manager = new LitestreamManager({
        ...mockConfig,
        dbPath: "/data/my'db.sqlite",
        replicaUrl: "s3://bucket/path'name",
      });
      const config = manager.generateConfig();
      expect(config).toContain("'/data/my''db.sqlite'");
      expect(config).toContain("'s3://bucket/path''name'");
    });

    it("omits access keys from the YAML config", () => {
      const manager = new LitestreamManager(mockConfig);
      const config = manager.generateConfig();
      expect(config).not.toContain("AKID");
      expect(config).not.toContain("secret");
      expect(config).not.toContain("access-key-id");
      expect(config).not.toContain("secret-access-key");
    });

    it("includes endpoint when set", () => {
      const manager = new LitestreamManager({
        ...mockConfig,
        endpoint: "https://minio.example.com",
      });
      const config = manager.generateConfig();
      expect(config).toContain("endpoint");
      expect(config).toContain("https://minio.example.com");
    });

    it("excludes endpoint when not set", () => {
      const manager = new LitestreamManager(mockConfig);
      const config = manager.generateConfig();
      expect(config).not.toContain("endpoint");
    });
  });

  describe("restore()", () => {
    it("skips restore when DB already exists", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const existingDbPath = join(tmpdir(), `existing-test-${Date.now()}.db`);
      writeFileSync(existingDbPath, "");

      const manager = new LitestreamManager({
        ...mockConfig,
        dbPath: existingDbPath,
      });

      // If DB exists, restore() returns early — no litestream binary call
      // We verify by checking no error is thrown (litestream is not installed in test env)
      expect(() => manager.restore()).not.toThrow();
      stderrSpy.mockRestore();
    });
  });

  describe("close()", () => {
    it("resolves immediately when no child process is running", async () => {
      const manager = new LitestreamManager(mockConfig);
      await expect(manager.close()).resolves.toBeUndefined();
    });

    it("sends SIGTERM and waits for child exit", async () => {
      const { EventEmitter } = await import("node:events");

      type FakeChild = NodeJS.EventEmitter & {
        kill: ReturnType<typeof vi.fn>;
        stdout: null;
        stderr: null;
      };

      const fakeChild = new EventEmitter() as FakeChild;
      fakeChild.kill = vi.fn().mockImplementation(() => {
        setImmediate(() => fakeChild.emit("exit", 0));
      });
      fakeChild.stdout = null;
      fakeChild.stderr = null;

      const manager = new LitestreamManager(mockConfig);
      // Inject fake child process
      (manager as unknown as { child: FakeChild }).child = fakeChild;

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      await manager.close();

      expect(fakeChild.kill).toHaveBeenCalledWith("SIGTERM");
      stderrSpy.mockRestore();
    });
  });
});
