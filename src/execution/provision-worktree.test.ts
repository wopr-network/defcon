import { describe, expect, it } from "vitest";
import { buildBranch, buildWorktreePath, parseIssueNumber, repoName } from "./provision-worktree.js";

describe("provision-worktree helpers", () => {
  describe("parseIssueNumber", () => {
    it("extracts number from WOP-392", () => {
      expect(parseIssueNumber("WOP-392")).toBe("392");
    });
    it("extracts number from wop-1234 (case insensitive)", () => {
      expect(parseIssueNumber("wop-1234")).toBe("1234");
    });
    it("throws on invalid key", () => {
      expect(() => parseIssueNumber("INVALID")).toThrow();
    });
  });

  describe("repoName", () => {
    it("extracts repo name from org/repo", () => {
      expect(repoName("wopr-network/defcon")).toBe("defcon");
    });
    it("handles bare repo name", () => {
      expect(repoName("defcon")).toBe("defcon");
    });
  });

  describe("buildBranch", () => {
    it("builds correct branch name", () => {
      expect(buildBranch("WOP-392")).toBe("agent/coder-392/wop-392");
    });
  });

  describe("buildWorktreePath", () => {
    it("builds correct worktree path", () => {
      expect(buildWorktreePath("wopr-network/defcon", "WOP-392", "/home/tsavo/worktrees")).toBe(
        "/home/tsavo/worktrees/wopr-defcon-coder-392",
      );
    });
  });
});
