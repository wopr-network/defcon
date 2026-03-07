import { mkdirSync, mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubCodeHostAdapter, MergeConflictError, PRNotFoundError, PathTraversalError } from "../../src/adapters/github.js";

type ExecFn = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

let mockExec: ReturnType<typeof vi.fn<ExecFn>>;
let adapter: GitHubCodeHostAdapter;

beforeEach(() => {
  mockExec = vi.fn<ExecFn>();
  adapter = new GitHubCodeHostAdapter(mockExec);
});

describe("GitHubCodeHostAdapter", () => {
  it("can be instantiated", () => {
    expect(adapter).toBeDefined();
  });
});

describe("getPR", () => {
  it("returns parsed JSON from gh pr view", async () => {
    const prJson = { number: 42, title: "Fix bug", state: "OPEN", url: "https://github.com/org/repo/pull/42" };
    mockExec.mockResolvedValueOnce({ stdout: JSON.stringify(prJson), stderr: "" });

    const result = await adapter.getPR("org/repo", 42);

    expect(mockExec).toHaveBeenCalledWith("gh", [
      "pr", "view", "42", "--repo", "org/repo", "--json",
      "number,title,state,body,author,baseRefName,headRefName,url,createdAt,updatedAt",
    ]);
    expect(result).toEqual(prJson);
  });

  it("throws PRNotFoundError when PR does not exist", async () => {
    mockExec.mockRejectedValueOnce(
      Object.assign(new Error("exit code 1"), { stderr: "Could not resolve to a PullRequest" }),
    );

    await expect(adapter.getPR("org/repo", 999)).rejects.toThrow(PRNotFoundError);
  });

  it("rethrows unexpected errors", async () => {
    mockExec.mockRejectedValueOnce(new Error("network timeout"));

    await expect(adapter.getPR("org/repo", 1)).rejects.toThrow("network timeout");
  });
});

describe("getDiff", () => {
  it("returns raw diff string from gh pr diff", async () => {
    const diff = "diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new";
    mockExec.mockResolvedValueOnce({ stdout: diff, stderr: "" });

    const result = await adapter.getDiff("org/repo", 42);

    expect(mockExec).toHaveBeenCalledWith("gh", ["pr", "diff", "42", "--repo", "org/repo"]);
    expect(result).toBe(diff.trim());
  });

  it("throws PRNotFoundError when PR does not exist", async () => {
    mockExec.mockRejectedValueOnce(
      Object.assign(new Error("exit code 1"), { stderr: "Could not resolve to a PullRequest" }),
    );

    await expect(adapter.getDiff("org/repo", 999)).rejects.toThrow(PRNotFoundError);
  });
});

describe("getChecks", () => {
  it("parses gh pr checks JSON output", async () => {
    const checksJson = [
      { name: "Build", state: "SUCCESS", conclusion: "success" },
      { name: "Lint", state: "PENDING", conclusion: "pending" },
    ];
    mockExec.mockResolvedValueOnce({ stdout: JSON.stringify(checksJson), stderr: "" });

    const result = await adapter.getChecks("org/repo", 42);

    expect(mockExec).toHaveBeenCalledWith("gh", [
      "pr", "checks", "42", "--repo", "org/repo", "--json", "name,state,conclusion",
    ]);
    expect(result).toEqual([
      { name: "Build", status: "SUCCESS", conclusion: "success" },
      { name: "Lint", status: "PENDING", conclusion: "pending" },
    ]);
  });

  it("returns empty array when no checks exist", async () => {
    mockExec.mockResolvedValueOnce({ stdout: "[]", stderr: "" });

    const result = await adapter.getChecks("org/repo", 42);
    expect(result).toEqual([]);
  });
});

describe("createPR", () => {
  it("creates PR and returns number + url", async () => {
    const createOutput = JSON.stringify({ number: 99, url: "https://github.com/org/repo/pull/99" });
    mockExec.mockResolvedValueOnce({ stdout: createOutput, stderr: "" });

    const result = await adapter.createPR("org/repo", {
      title: "My PR",
      body: "Description",
      head: "feat-branch",
      base: "main",
    });

    expect(mockExec).toHaveBeenCalledWith("gh", [
      "pr", "create", "--repo", "org/repo",
      "--title", "My PR", "--body", "Description",
      "--head", "feat-branch", "--base", "main",
      "--json", "number,url",
    ]);
    expect(result).toEqual({ number: 99, url: "https://github.com/org/repo/pull/99" });
  });
});

describe("mergePR", () => {
  it("merges with squash strategy and auto flag", async () => {
    mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });

    await adapter.mergePR("org/repo", 42, "squash");

    expect(mockExec).toHaveBeenCalledWith("gh", [
      "pr", "merge", "42", "--repo", "org/repo", "--squash", "--auto",
    ]);
  });

  it("merges with merge strategy", async () => {
    mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });

    await adapter.mergePR("org/repo", 42, "merge");

    expect(mockExec).toHaveBeenCalledWith("gh", [
      "pr", "merge", "42", "--repo", "org/repo", "--merge", "--auto",
    ]);
  });

  it("merges with rebase strategy", async () => {
    mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });

    await adapter.mergePR("org/repo", 42, "rebase");

    expect(mockExec).toHaveBeenCalledWith("gh", [
      "pr", "merge", "42", "--repo", "org/repo", "--rebase", "--auto",
    ]);
  });

  it("throws MergeConflictError on conflict", async () => {
    mockExec.mockRejectedValueOnce(
      Object.assign(new Error("exit code 1"), { stderr: "is not mergeable" }),
    );

    await expect(adapter.mergePR("org/repo", 42, "squash")).rejects.toThrow(MergeConflictError);
  });
});

describe("createWorktree", () => {
  it("calls git worktree add and returns the validated path", async () => {
    mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });

    const result = await adapter.createWorktree("./repos/org-repo", "feat-branch", "./worktrees/feat");

    const expectedWorktree = resolve("./worktrees/feat");
    const expectedRepo = resolve("./repos/org-repo");
    expect(mockExec).toHaveBeenCalledWith("git", [
      "-C", expectedRepo, "worktree", "add", "-b", "feat-branch", expectedWorktree,
    ]);
    expect(result).toBe(expectedWorktree);
  });
});

describe("removeWorktree", () => {
  it("calls git worktree remove --force then prune with repo context", async () => {
    mockExec
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    await adapter.removeWorktree("./worktrees/feat", "./repos/org-repo");

    const expectedWorktree = resolve("./worktrees/feat");
    const expectedRepo = resolve("./repos/org-repo");
    expect(mockExec).toHaveBeenCalledTimes(2);
    expect(mockExec).toHaveBeenNthCalledWith(1, "git", [
      "-C", expectedRepo, "worktree", "remove", "--force", expectedWorktree,
    ]);
    expect(mockExec).toHaveBeenNthCalledWith(2, "git", [
      "-C", expectedRepo, "worktree", "prune",
    ]);
  });
});

describe("path validation", () => {
  describe("createWorktree", () => {
    it("rejects worktree path outside WORKTREE_BASE", async () => {
      await expect(
        adapter.createWorktree("./repos/org-repo", "feat", "../../etc/important"),
      ).rejects.toThrow(PathTraversalError);
      expect(mockExec).not.toHaveBeenCalled();
    });

    it("rejects absolute worktree path outside WORKTREE_BASE", async () => {
      await expect(
        adapter.createWorktree("./repos/org-repo", "feat", "/etc/important"),
      ).rejects.toThrow(PathTraversalError);
      expect(mockExec).not.toHaveBeenCalled();
    });

    it("rejects localRepoPath outside REPOS_BASE", async () => {
      await expect(
        adapter.createWorktree("../../etc/shadow", "feat", "./worktrees/feat"),
      ).rejects.toThrow(PathTraversalError);
      expect(mockExec).not.toHaveBeenCalled();
    });

    it("rejects absolute localRepoPath outside REPOS_BASE", async () => {
      await expect(
        adapter.createWorktree("/etc/shadow", "feat", "./worktrees/feat"),
      ).rejects.toThrow(PathTraversalError);
      expect(mockExec).not.toHaveBeenCalled();
    });

    it("accepts valid paths within allowed bases", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });
      const worktreePath = process.env.WORKTREE_BASE
        ? process.env.WORKTREE_BASE + "/feat"
        : "./worktrees/feat";
      const repoPath = process.env.REPOS_BASE
        ? process.env.REPOS_BASE + "/org-repo"
        : "./repos/org-repo";

      const result = await adapter.createWorktree(repoPath, "feat", worktreePath);

      expect(mockExec).toHaveBeenCalledTimes(1);
      expect(typeof result).toBe("string");
    });

    it("accepts worktree path with dot-prefixed directory name inside WORKTREE_BASE", async () => {
      const tmpWorktreeBase = mkdtempSync(join(tmpdir(), "wt-base-"));
      const dotPrefixedDir = join(tmpWorktreeBase, "..hidden-dir");
      mkdirSync(dotPrefixedDir, { recursive: true });

      const tmpReposBase = mkdtempSync(join(tmpdir(), "repos-base-"));
      mkdirSync(join(tmpReposBase, "org-repo"), { recursive: true });

      const origWorktreeBase = process.env.WORKTREE_BASE;
      const origReposBase = process.env.REPOS_BASE;
      process.env.WORKTREE_BASE = tmpWorktreeBase;
      process.env.REPOS_BASE = tmpReposBase;
      try {
        mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });
        const result = await adapter.createWorktree(
          join(tmpReposBase, "org-repo"),
          "feat",
          dotPrefixedDir,
        );
        expect(mockExec).toHaveBeenCalledTimes(1);
        expect(result).toBe(dotPrefixedDir);
      } finally {
        process.env.WORKTREE_BASE = origWorktreeBase;
        process.env.REPOS_BASE = origReposBase;
        rmSync(tmpWorktreeBase, { recursive: true, force: true });
        rmSync(tmpReposBase, { recursive: true, force: true });
      }
    });

    it("rejects a localRepoPath symlink inside REPOS_BASE that points outside", async () => {
      // Create a temporary directory to act as REPOS_BASE
      const tmpReposBase = mkdtempSync(join(tmpdir(), "repos-base-"));
      // Create a symlink inside the base pointing to /tmp (outside)
      const symlinkPath = join(tmpReposBase, "evil-repo");
      symlinkSync(tmpdir(), symlinkPath);

      const origReposBase = process.env.REPOS_BASE;
      process.env.REPOS_BASE = tmpReposBase;
      try {
        await expect(
          adapter.createWorktree(symlinkPath, "feat", "./worktrees/feat"),
        ).rejects.toThrow(PathTraversalError);
        expect(mockExec).not.toHaveBeenCalled();
      } finally {
        process.env.REPOS_BASE = origReposBase;
        rmSync(tmpReposBase, { recursive: true, force: true });
      }
    });
  });

  describe("removeWorktree", () => {
    it("rejects worktree path outside WORKTREE_BASE", async () => {
      await expect(
        adapter.removeWorktree("../../etc/important", "./repos/org-repo"),
      ).rejects.toThrow(PathTraversalError);
      expect(mockExec).not.toHaveBeenCalled();
    });

    it("rejects localRepoPath outside REPOS_BASE", async () => {
      await expect(
        adapter.removeWorktree("./worktrees/feat", "../../etc/shadow"),
      ).rejects.toThrow(PathTraversalError);
      expect(mockExec).not.toHaveBeenCalled();
    });

    it("accepts valid paths within allowed bases", async () => {
      mockExec
        .mockResolvedValueOnce({ stdout: "", stderr: "" })
        .mockResolvedValueOnce({ stdout: "", stderr: "" });
      const worktreePath = process.env.WORKTREE_BASE
        ? process.env.WORKTREE_BASE + "/feat"
        : "./worktrees/feat";
      const repoPath = process.env.REPOS_BASE
        ? process.env.REPOS_BASE + "/org-repo"
        : "./repos/org-repo";

      await adapter.removeWorktree(worktreePath, repoPath);

      expect(mockExec).toHaveBeenCalledTimes(2);
    });
  });
});
