/**
 * Flow Editor REST routes.
 *
 * Endpoints for conversational flow editing via natural language.
 */

import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { FlowEditService } from "../flows/flow-edit-service.js";

export interface FlowEditorRouteDeps {
  flowEditService: FlowEditService;
  workerToken?: string;
}

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createFlowEditorRoutes(deps: FlowEditorRouteDeps): Hono {
  const app = new Hono();

  // Bearer-token auth middleware (mirrors engine.ts)
  app.use("/*", async (c, next) => {
    if (!deps.workerToken) return next();
    const auth = c.req.header("Authorization");
    if (!auth) return c.json({ error: "Missing Authorization header" }, 401);
    const parts = auth.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      return c.json({ error: "Invalid Authorization format" }, 401);
    }
    if (!tokensMatch(parts[1], deps.workerToken)) {
      return c.json({ error: "Invalid token" }, 403);
    }
    return next();
  });

  // POST /repos/:owner/:repo/flow/edit — edit a flow via natural language
  app.post("/repos/:owner/:repo/flow/edit", async (c) => {
    const owner = c.req.param("owner");
    const repo = c.req.param("repo");
    const repoFullName = `${owner}/${repo}`;

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const message = body.message;
    const currentYaml = body.currentYaml;

    if (typeof message !== "string" || !message.trim()) {
      return c.json({ error: "message is required" }, 400);
    }

    const yamlInput = typeof currentYaml === "string" ? currentYaml : "";

    try {
      const result = await deps.flowEditService.editFlow(repoFullName, message.trim(), yamlInput);
      return c.json(
        {
          updatedYaml: result.updatedYaml,
          explanation: result.explanation,
          diff: result.diff,
        },
        200,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("missing UPDATED_YAML")) {
        return c.json({ error: "Flow edit failed: LLM output could not be parsed", detail: message }, 422);
      }
      return c.json({ error: message }, 500);
    }
  });

  return app;
}
