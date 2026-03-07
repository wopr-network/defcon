import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ProvisionWorktreeResult {
  worktreePath: string;
  branch: string;
  repo: string;
}

export function parseIssueNumber(issueKey: string): string {
  const match = issueKey.match(/^[A-Za-z]+[-](\d+)$/);
  if (!match) {
    throw new Error(`Invalid issue key: ${issueKey}. Expected format: WOP-123`);
  }
  return match[1];
}

export function repoName(repo: string): string {
  const parts = repo.split("/");
  return parts[parts.length - 1];
}

export function buildBranch(issueKey: string): string {
  const num = parseIssueNumber(issueKey);
  return `agent/coder-${num}/${issueKey.toLowerCase()}`;
}

export function buildWorktreePath(repo: string, issueKey: string, basePath: string): string {
  const name = repoName(repo);
  const num = parseIssueNumber(issueKey);
  return join(basePath, `wopr-${name}-coder-${num}`);
}

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function provisionWorktree(opts: {
  repo: string;
  issueKey: string;
  basePath?: string;
  cloneRoot?: string;
}): ProvisionWorktreeResult {
  const basePath = opts.basePath ?? "/home/tsavo/worktrees";
  const cloneRoot = opts.cloneRoot ?? "/home/tsavo";
  const name = repoName(opts.repo);
  const clonePath = join(cloneRoot, name);
  const worktreePath = buildWorktreePath(opts.repo, opts.issueKey, basePath);
  const branch = buildBranch(opts.issueKey);

  // Idempotent: if worktree already exists, verify and return
  if (existsSync(worktreePath)) {
    try {
      run("git", ["rev-parse", "--git-dir"], worktreePath);
      // It's a valid git worktree — return success
      return { worktreePath, branch, repo: opts.repo };
    } catch {
      throw new Error(`Path ${worktreePath} exists but is not a git worktree`);
    }
  }

  // Clone if repo not present
  if (!existsSync(clonePath)) {
    const cloneUrl = `https://github.com/${opts.repo}.git`;
    process.stderr.write(`Cloning ${cloneUrl} to ${clonePath}...\n`);
    run("git", ["clone", cloneUrl, clonePath]);
  }

  // Fetch latest
  process.stderr.write(`Fetching origin in ${clonePath}...\n`);
  run("git", ["fetch", "origin"], clonePath);

  // Create worktree
  process.stderr.write(`Creating worktree at ${worktreePath}...\n`);
  run("git", ["worktree", "add", worktreePath, "-B", branch, "origin/main"], clonePath);

  // Install dependencies
  const hasPnpmLock = existsSync(join(worktreePath, "pnpm-lock.yaml"));
  const installCmd = hasPnpmLock ? "pnpm" : "npm";
  process.stderr.write(`Running ${installCmd} install in ${worktreePath}...\n`);
  run(installCmd, ["install"], worktreePath);

  return { worktreePath, branch, repo: opts.repo };
}
