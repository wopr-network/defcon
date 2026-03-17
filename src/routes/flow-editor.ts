/**
 * Flow editor REST routes.
 *
 * Endpoints for reading and writing .holyship/flow.yml from a customer repo.
 */

import { Hono } from "hono";
import { parse as parseYaml } from "yaml";

export interface FlowEditorRouteDeps {
  getGithubToken: () => Promise<string | null>;
}

export function createFlowEditorRoutes(deps: FlowEditorRouteDeps): Hono {
  const app = new Hono();

  // GET /repos/:owner/:repo/flow — read .holyship/flow.yml
  app.get("/repos/:owner/:repo/flow", async (c) => {
    const owner = c.req.param("owner");
    const repo = c.req.param("repo");

    const token = await deps.getGithubToken();
    if (!token) {
      return c.json({ error: "GitHub App not configured" }, 501);
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/.holyship/flow.yml`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (res.status === 404) {
      return c.json({ error: "No flow.yml found. Create .holyship/flow.yml to get started." }, 404);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return c.json({ error: `GitHub API error: ${res.status}`, detail: text.slice(0, 500) }, 502);
    }

    const data = (await res.json()) as { content: string; sha: string; encoding: string };

    if (data.encoding !== "base64") {
      return c.json({ error: `Unexpected encoding: ${data.encoding}` }, 502);
    }

    const yaml = Buffer.from(data.content, "base64").toString("utf-8");

    let flow: unknown;
    try {
      flow = parseYaml(yaml);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Invalid YAML in flow.yml", detail: message }, 422);
    }

    return c.json({ yaml, flow, sha: data.sha }, 200);
  });

  // POST /repos/:owner/:repo/flow/apply — create a PR with updated .holyship/flow.yml
  app.post("/repos/:owner/:repo/flow/apply", async (c) => {
    const owner = c.req.param("owner");
    const repo = c.req.param("repo");

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const yaml = body.yaml as string | undefined;
    const commitMessage = (body.commitMessage as string | undefined) ?? "chore: update .holyship/flow.yml";
    const baseSha = body.baseSha as string | undefined;

    if (!yaml || yaml.trim() === "") {
      return c.json({ error: "yaml is required and must not be empty" }, 422);
    }

    if (!baseSha) {
      return c.json({ error: "baseSha is required (use the sha returned by GET /repos/:owner/:repo/flow)" }, 422);
    }

    const token = await deps.getGithubToken();
    if (!token) {
      return c.json({ error: "GitHub App not configured" }, 501);
    }

    const ghHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };

    // Step 1: Get default branch SHA to base new branch on
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: ghHeaders,
    });
    if (!repoRes.ok) {
      const text = await repoRes.text().catch(() => "");
      return c.json({ error: `GitHub API error getting repo: ${repoRes.status}`, detail: text.slice(0, 500) }, 502);
    }
    const repoData = (await repoRes.json()) as { default_branch: string };
    const defaultBranch = repoData.default_branch;

    const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, {
      headers: ghHeaders,
    });
    if (!refRes.ok) {
      const text = await refRes.text().catch(() => "");
      return c.json({ error: `GitHub API error getting ref: ${refRes.status}`, detail: text.slice(0, 500) }, 502);
    }
    const refData = (await refRes.json()) as { object: { sha: string } };
    const baseBranchSha = refData.object.sha;

    // Step 2: Create a new branch
    const branchName = `holyship/flow-update-${Date.now()}`;
    const createBranchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      headers: ghHeaders,
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseBranchSha,
      }),
    });
    if (!createBranchRes.ok) {
      const text = await createBranchRes.text().catch(() => "");
      return c.json(
        { error: `GitHub API error creating branch: ${createBranchRes.status}`, detail: text.slice(0, 500) },
        502,
      );
    }

    // Step 3: Update .holyship/flow.yml on the new branch using baseSha for optimistic concurrency
    const content = Buffer.from(yaml, "utf-8").toString("base64");
    const updateFileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/.holyship/flow.yml`, {
      method: "PUT",
      headers: ghHeaders,
      body: JSON.stringify({
        message: commitMessage,
        content,
        sha: baseSha,
        branch: branchName,
      }),
    });

    if (updateFileRes.status === 409) {
      // Conflict: baseSha is stale — file was modified since it was read
      const text = await updateFileRes.text().catch(() => "");
      return c.json(
        {
          error: "Conflict: flow.yml has been modified since you last read it. Fetch the latest sha and retry.",
          detail: text.slice(0, 500),
        },
        409,
      );
    }

    if (!updateFileRes.ok) {
      const text = await updateFileRes.text().catch(() => "");
      return c.json(
        { error: `GitHub API error updating file: ${updateFileRes.status}`, detail: text.slice(0, 500) },
        502,
      );
    }

    // Step 4: Create a PR from the new branch to the default branch
    const createPrRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: ghHeaders,
      body: JSON.stringify({
        title: commitMessage,
        head: branchName,
        base: defaultBranch,
        body: "Automated flow configuration update via Holyship.",
      }),
    });

    if (!createPrRes.ok) {
      const text = await createPrRes.text().catch(() => "");
      return c.json({ error: `GitHub API error creating PR: ${createPrRes.status}`, detail: text.slice(0, 500) }, 502);
    }

    const prData = (await createPrRes.json()) as { html_url: string; number: number };

    return c.json(
      {
        prUrl: prData.html_url,
        prNumber: prData.number,
        branch: branchName,
      },
      201,
    );
  });

  return app;
}
