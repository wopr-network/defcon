import { describe, expect, it } from "vitest";
import { mcpResultToResponse } from "./hono-server.js";

describe("mcpResultToResponse error code routing", () => {
  it("returns 404 when errorCode is NOT_FOUND regardless of message text", () => {
    const result = mcpResultToResponse({
      content: [{ type: "text", text: "Entity xyz does not exist" }],
      isError: true,
      errorCode: "NOT_FOUND",
    });
    expect(result.status).toBe(404);
  });

  it("returns 400 when errorCode is VALIDATION", () => {
    const result = mcpResultToResponse({
      content: [{ type: "text", text: "bad input" }],
      isError: true,
      errorCode: "VALIDATION",
    });
    expect(result.status).toBe(400);
  });

  it("returns 409 when errorCode is CONFLICT", () => {
    const result = mcpResultToResponse({
      content: [{ type: "text", text: "already exists" }],
      isError: true,
      errorCode: "CONFLICT",
    });
    expect(result.status).toBe(409);
  });

  it("returns 401 via string matching when message contains Unauthorized", () => {
    const result = mcpResultToResponse({
      content: [{ type: "text", text: "Unauthorized: worker tools require authentication." }],
      isError: true,
    });
    expect(result.status).toBe(401);
  });

  it("falls back to string matching when no errorCode - not found", () => {
    const result = mcpResultToResponse({
      content: [{ type: "text", text: "Entity not found: abc" }],
      isError: true,
    });
    expect(result.status).toBe(404);
  });

  it("returns 500 for unknown errors without errorCode", () => {
    const result = mcpResultToResponse({
      content: [{ type: "text", text: "something unexpected" }],
      isError: true,
    });
    expect(result.status).toBe(500);
  });

  it("returns 200 for successful results", () => {
    const result = mcpResultToResponse({
      content: [{ type: "text", text: '{"ok":true}' }],
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
  });

  it("returns 204 for null body", () => {
    const result = mcpResultToResponse({
      content: [{ type: "text", text: "null" }],
    });
    expect(result.status).toBe(204);
  });
});
