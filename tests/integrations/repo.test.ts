import { describe, it, expect, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../helpers/pg-test-db.js";
import { DrizzleIntegrationRepository } from "../../src/integrations/repo.js";
import type { CreateIntegrationParams } from "../../src/integrations/repo.js";
import { decryptCredentials } from "../../src/integrations/encrypt.js";

const TEST_TENANT = "tenant-test-1";

function makeParams(overrides?: Partial<CreateIntegrationParams>): CreateIntegrationParams {
  return {
    name: "my-linear",
    category: "issue_tracker",
    provider: "linear",
    credentials: { provider: "linear", accessToken: "lin_test_token" },
    ...overrides,
  };
}

describe("DrizzleIntegrationRepository", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let repo: DrizzleIntegrationRepository;

  afterEach(async () => {
    if (close) await close();
  });

  async function setup() {
    const res = await createTestDb();
    db = res.db;
    close = res.close;
    repo = new DrizzleIntegrationRepository(db, TEST_TENANT);
  }

  it("creates an integration and returns a row with encrypted credentials", async () => {
    await setup();
    const row = await repo.create(makeParams());
    expect(row.id).toBeDefined();
    expect(row.tenantId).toBe(TEST_TENANT);
    expect(row.name).toBe("my-linear");
    expect(row.category).toBe("issue_tracker");
    expect(row.provider).toBe("linear");
    expect(row.encryptedCredentials).toBeDefined();
    // Verify credentials are encrypted (not plaintext JSON)
    expect(row.encryptedCredentials).toContain(":");
    // Verify they decrypt correctly
    const decrypted = decryptCredentials(row.encryptedCredentials);
    expect(decrypted).toEqual({ provider: "linear", accessToken: "lin_test_token" });
  });

  it("getById returns the created integration", async () => {
    await setup();
    const created = await repo.create(makeParams());
    const fetched = await repo.getById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe("my-linear");
  });

  it("getById returns null for nonexistent id", async () => {
    await setup();
    const fetched = await repo.getById("nonexistent-id");
    expect(fetched).toBeNull();
  });

  it("getByName returns the created integration", async () => {
    await setup();
    await repo.create(makeParams());
    const fetched = await repo.getByName("my-linear");
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("my-linear");
  });

  it("getByName returns null for nonexistent name", async () => {
    await setup();
    const fetched = await repo.getByName("no-such-name");
    expect(fetched).toBeNull();
  });

  it("listByCategory returns only matching category", async () => {
    await setup();
    await repo.create(makeParams({ name: "linear-1", category: "issue_tracker", provider: "linear" }));
    await repo.create(
      makeParams({
        name: "gh-vcs",
        category: "vcs",
        provider: "github",
        credentials: { provider: "github", accessToken: "ghp_test" },
      }),
    );
    const trackers = await repo.listByCategory("issue_tracker");
    expect(trackers).toHaveLength(1);
    expect(trackers[0]!.name).toBe("linear-1");
    const vcs = await repo.listByCategory("vcs");
    expect(vcs).toHaveLength(1);
    expect(vcs[0]!.name).toBe("gh-vcs");
  });

  it("list returns all integrations for the tenant", async () => {
    await setup();
    await repo.create(makeParams({ name: "int-1" }));
    await repo.create(makeParams({ name: "int-2" }));
    const all = await repo.list();
    expect(all).toHaveLength(2);
  });

  it("updateCredentials replaces the encrypted blob", async () => {
    await setup();
    const created = await repo.create(makeParams());
    const newCreds = { provider: "linear" as const, accessToken: "lin_new_token", workspaceId: "ws-2" };
    const updated = await repo.updateCredentials(created.id, newCreds);
    expect(updated.encryptedCredentials).not.toBe(created.encryptedCredentials);
    const decrypted = decryptCredentials(updated.encryptedCredentials);
    expect(decrypted).toEqual(newCreds);
  });

  it("updateCredentials throws for nonexistent id", async () => {
    await setup();
    const creds = { provider: "linear" as const, accessToken: "tok" };
    await expect(repo.updateCredentials("bad-id", creds)).rejects.toThrow("Integration not found");
  });

  it("delete removes the integration", async () => {
    await setup();
    const created = await repo.create(makeParams());
    await repo.delete(created.id);
    const fetched = await repo.getById(created.id);
    expect(fetched).toBeNull();
  });

  it("enforces unique (tenantId, name) constraint", async () => {
    await setup();
    await repo.create(makeParams({ name: "unique-name" }));
    await expect(repo.create(makeParams({ name: "unique-name" }))).rejects.toThrow();
  });

  it("isolates integrations between tenants", async () => {
    await setup();
    const tenant2Repo = new DrizzleIntegrationRepository(db, "tenant-2");
    await repo.create(makeParams({ name: "shared-name" }));
    await tenant2Repo.create(makeParams({ name: "shared-name" }));
    const t1List = await repo.list();
    const t2List = await tenant2Repo.list();
    expect(t1List).toHaveLength(1);
    expect(t2List).toHaveLength(1);
    expect(t1List[0]!.tenantId).toBe(TEST_TENANT);
    expect(t2List[0]!.tenantId).toBe("tenant-2");
  });

  it("getById does not return another tenant's integration", async () => {
    await setup();
    const tenant2Repo = new DrizzleIntegrationRepository(db, "tenant-2");
    const created = await tenant2Repo.create(makeParams({ name: "other-tenant-int" }));
    const fetched = await repo.getById(created.id);
    expect(fetched).toBeNull();
  });
});
