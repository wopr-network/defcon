import { describe, it, expect, vi } from "vitest";
import { AdapterRegistry } from "../../src/integrations/registry.js";
import { encryptCredentials } from "../../src/integrations/encrypt.js";
import { opCategory } from "../../src/integrations/types.js";
import type { IIntegrationRepository, IntegrationRow } from "../../src/integrations/repo.js";
import type { IntegrationCredentials } from "../../src/integrations/types.js";

function makeRow(creds: IntegrationCredentials, overrides?: Partial<IntegrationRow>): IntegrationRow {
  return {
    id: "int-1",
    tenantId: "tenant-1",
    name: "test-integration",
    category: "issue_tracker",
    provider: creds.provider,
    encryptedCredentials: encryptCredentials(creds),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockRepo(row: IntegrationRow | null): IIntegrationRepository {
  return {
    create: vi.fn(),
    getById: vi.fn().mockResolvedValue(row),
    getByName: vi.fn(),
    listByCategory: vi.fn(),
    list: vi.fn(),
    updateCredentials: vi.fn(),
    delete: vi.fn(),
  };
}

describe("opCategory", () => {
  it("returns issue_tracker for issue_tracker.* ops", () => {
    expect(opCategory("issue_tracker.comment_exists")).toBe("issue_tracker");
    expect(opCategory("issue_tracker.fetch_comment")).toBe("issue_tracker");
    expect(opCategory("issue_tracker.post_comment")).toBe("issue_tracker");
    expect(opCategory("issue_tracker.issue_state")).toBe("issue_tracker");
  });

  it("returns vcs for vcs.* ops", () => {
    expect(opCategory("vcs.ci_status")).toBe("vcs");
    expect(opCategory("vcs.pr_status")).toBe("vcs");
    expect(opCategory("vcs.provision_worktree")).toBe("vcs");
    expect(opCategory("vcs.merge_pr")).toBe("vcs");
  });
});

describe("AdapterRegistry", () => {
  it("throws when integration is not found", async () => {
    const repo = makeMockRepo(null);
    const registry = new AdapterRegistry(repo);
    await expect(
      registry.execute("bad-id", "issue_tracker.comment_exists", { issueId: "X", pattern: "Y" }),
    ).rejects.toThrow("Integration not found: bad-id");
  });

  it("throws for unknown provider in credentials", async () => {
    const badCreds = { provider: "unknown_provider", accessToken: "tok" } as unknown as IntegrationCredentials;
    // makeRow() already calls encryptCredentials internally
    const row = makeRow(badCreds);
    const repo = makeMockRepo(row);
    const registry = new AdapterRegistry(repo);
    await expect(
      registry.execute("int-1", "issue_tracker.comment_exists", { issueId: "X", pattern: "Y" }),
    ).rejects.toThrow("Unknown integration provider");
  });

  it("resolves credentials fresh on each execute call (no caching)", async () => {
    const creds: IntegrationCredentials = { provider: "linear", accessToken: "lin_test" };
    const row = makeRow(creds);
    const repo = makeMockRepo(row);
    const registry = new AdapterRegistry(repo);

    // Call execute twice — getById should be called twice (no caching)
    try {
      await registry.execute("int-1", "issue_tracker.issue_state", { issueId: "X" });
    } catch {
      // LinearAdapter will try to call the real SDK — that's OK, just check call count
    }
    try {
      await registry.execute("int-1", "issue_tracker.issue_state", { issueId: "Y" });
    } catch {
      // Same
    }
    expect(repo.getById).toHaveBeenCalledTimes(2);
  });

  it("calls getById with the provided integrationId", async () => {
    const repo = makeMockRepo(null);
    const registry = new AdapterRegistry(repo);
    try {
      await registry.execute("specific-id-123", "issue_tracker.comment_exists", { issueId: "X", pattern: "Y" });
    } catch {
      // Will throw "Integration not found" — that's expected
    }
    expect(repo.getById).toHaveBeenCalledWith("specific-id-123");
  });

  // TODO(WOP-2166): Add dispatch tests for vcs.* ops (vcs.ci_status, vcs.pr_status, vcs.provision_worktree,
  // vcs.merge_pr) to cover the VCS adapter routing path through AdapterRegistry.execute().
});
