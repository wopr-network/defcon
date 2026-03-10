import { LinearClient } from "@linear/sdk";
import type { IIssueTrackerAdapter, LinearCredentials, PrimitiveOpResult } from "../types.js";

export class LinearAdapter implements IIssueTrackerAdapter {
  readonly provider = "linear" as const;
  private client: LinearClient;

  constructor(credentials: LinearCredentials) {
    this.client = new LinearClient({ accessToken: credentials.accessToken });
  }

  async commentExists({ issueId, pattern }: { issueId: string; pattern: string }): Promise<PrimitiveOpResult> {
    const issue = await this.client.issue(issueId);
    const comments = await issue.comments();
    const found = comments.nodes.some((c) => c.body.includes(pattern));
    return { outcome: found ? "exists" : "not_found" };
  }

  async fetchComment({ issueId, pattern }: { issueId: string; pattern: string }): Promise<PrimitiveOpResult> {
    const issue = await this.client.issue(issueId);
    const comments = await issue.comments();
    const match = comments.nodes.find((c) => c.body.includes(pattern));
    if (!match) {
      throw new Error(`No comment matching "${pattern}" found on issue ${issueId}`);
    }
    return { body: match.body, commentId: match.id };
  }

  async postComment({ issueId, body }: { issueId: string; body: string }): Promise<PrimitiveOpResult> {
    const result = await this.client.createComment({ issueId, body });
    const comment = await result.comment;
    if (!comment) {
      throw new Error(`Failed to create comment on issue ${issueId}`);
    }
    return { commentId: comment.id };
  }

  async issueState({ issueId }: { issueId: string }): Promise<PrimitiveOpResult> {
    const issue = await this.client.issue(issueId);
    const state = await issue.state;
    return { outcome: state?.name ?? "unknown" };
  }
}
