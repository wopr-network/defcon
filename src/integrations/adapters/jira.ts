import type { IIssueTrackerAdapter, JiraCredentials, PrimitiveOpResult } from "../types.js";

interface JiraComment {
  id: string;
  body: {
    content?: Array<{ content?: Array<{ text?: string }> }>;
  };
}

interface JiraIssue {
  fields: {
    status: { name: string };
    comment: { comments: JiraComment[] };
  };
}

function extractCommentText(comment: JiraComment): string {
  // Jira uses Atlassian Document Format (ADF) — flatten text nodes
  return (comment.body.content ?? [])
    .flatMap((block) => block.content ?? [])
    .map((node) => node.text ?? "")
    .join("");
}

export class JiraAdapter implements IIssueTrackerAdapter {
  readonly provider = "jira" as const;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(credentials: JiraCredentials) {
    this.baseUrl = credentials.baseUrl.replace(/\/$/, "");
    this.headers = {
      Authorization: `Bearer ${credentials.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async getIssue(issueId: string): Promise<JiraIssue> {
    const res = await fetch(`${this.baseUrl}/rest/api/3/issue/${issueId}?fields=status,comment`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Jira API error ${res.status} for issue ${issueId}`);
    return res.json() as Promise<JiraIssue>;
  }

  async commentExists({ issueId, pattern }: { issueId: string; pattern: string }): Promise<PrimitiveOpResult> {
    const issue = await this.getIssue(issueId);
    const found = issue.fields.comment.comments.some((c) => extractCommentText(c).includes(pattern));
    return { outcome: found ? "exists" : "not_found" };
  }

  async fetchComment({ issueId, pattern }: { issueId: string; pattern: string }): Promise<PrimitiveOpResult> {
    const issue = await this.getIssue(issueId);
    const match = issue.fields.comment.comments.find((c) => extractCommentText(c).includes(pattern));
    if (!match) throw new Error(`No comment matching "${pattern}" found on Jira issue ${issueId}`);
    return { body: extractCommentText(match), commentId: match.id };
  }

  async postComment({ issueId, body }: { issueId: string; body: string }): Promise<PrimitiveOpResult> {
    const res = await fetch(`${this.baseUrl}/rest/api/3/issue/${issueId}/comment`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: body }] }],
        },
      }),
    });
    if (!res.ok) throw new Error(`Jira API error ${res.status} posting comment on ${issueId}`);
    const created = (await res.json()) as { id: string };
    return { commentId: created.id };
  }

  async issueState({ issueId }: { issueId: string }): Promise<PrimitiveOpResult> {
    const issue = await this.getIssue(issueId);
    return { outcome: issue.fields.status.name };
  }
}
