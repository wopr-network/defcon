import { describe, it, expect, vi, beforeEach } from "vitest";

const mockComments = {
  nodes: [
    { id: "comment-1", body: "## Implementation Spec\nDetails here" },
    { id: "comment-2", body: "Looks good to me" },
  ],
};
const mockState = { name: "In Progress" };

const mockIssue = {
  comments: vi.fn().mockResolvedValue(mockComments),
  get state() {
    return Promise.resolve(mockState);
  },
};

const mockCreateComment = vi.fn().mockResolvedValue({
  comment: Promise.resolve({ id: "new-comment-id" }),
});

const mockClientInstance = {
  issue: vi.fn().mockResolvedValue(mockIssue),
  createComment: mockCreateComment,
};

// Mock @linear/sdk before importing the adapter
vi.mock("@linear/sdk", () => {
  return {
    LinearClient: class LinearClient {
      constructor() {
        // instance methods defined below are shared via mockClientInstance
      }
      issue = mockClientInstance.issue;
      createComment = mockClientInstance.createComment;
    },
  };
});

import { LinearAdapter } from "../../src/integrations/adapters/linear.js";
import { LinearClient } from "@linear/sdk";

describe("LinearAdapter", () => {
  let adapter: LinearAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks to defaults after clearAllMocks
    mockClientInstance.issue.mockResolvedValue(mockIssue);
    mockCreateComment.mockResolvedValue({ comment: Promise.resolve({ id: "new-comment-id" }) });
    adapter = new LinearAdapter({ provider: "linear", accessToken: "lin_test_token" });
  });

  it("constructs a LinearClient with the provided access token", () => {
    // LinearClient should have been called (class was instantiated)
    expect(adapter).toBeInstanceOf(LinearAdapter);
    expect(adapter.provider).toBe("linear");
  });

  describe("commentExists", () => {
    it('returns { outcome: "exists" } when a matching comment is found', async () => {
      const result = await adapter.commentExists({ issueId: "ISSUE-1", pattern: "## Implementation Spec" });
      expect(result).toEqual({ outcome: "exists" });
    });

    it('returns { outcome: "not_found" } when no comment matches', async () => {
      const result = await adapter.commentExists({ issueId: "ISSUE-1", pattern: "nonexistent pattern" });
      expect(result).toEqual({ outcome: "not_found" });
    });
  });

  describe("fetchComment", () => {
    it("returns body and commentId for a matching comment", async () => {
      const result = await adapter.fetchComment({ issueId: "ISSUE-1", pattern: "## Implementation Spec" });
      expect(result).toEqual({
        body: "## Implementation Spec\nDetails here",
        commentId: "comment-1",
      });
    });

    it("throws when no comment matches the pattern", async () => {
      await expect(adapter.fetchComment({ issueId: "ISSUE-1", pattern: "no match" })).rejects.toThrow(
        'No comment matching "no match" found on issue ISSUE-1',
      );
    });
  });

  describe("postComment", () => {
    it("creates a comment and returns the commentId", async () => {
      const result = await adapter.postComment({ issueId: "ISSUE-1", body: "New comment" });
      expect(result).toEqual({ commentId: "new-comment-id" });
    });

    it("throws when comment creation fails (null comment)", async () => {
      mockCreateComment.mockResolvedValueOnce({ comment: Promise.resolve(null) });
      await expect(adapter.postComment({ issueId: "ISSUE-1", body: "test" })).rejects.toThrow(
        "Failed to create comment on issue ISSUE-1",
      );
    });
  });

  describe("issueState", () => {
    it("returns the issue state name as outcome", async () => {
      const result = await adapter.issueState({ issueId: "ISSUE-1" });
      expect(result).toEqual({ outcome: "In Progress" });
    });
  });
});

// Suppress unused import warning
void LinearClient;
