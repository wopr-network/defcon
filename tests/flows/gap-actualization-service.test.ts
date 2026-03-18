import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("../../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GapActualizationService } from "../../src/flows/gap-actualization-service.js";
import type { InterrogationService } from "../../src/flows/interrogation-service.js";
import type { Engine } from "../../src/engine/engine.js";

function mockInterrogationService() {
  return {
    getGaps: vi.fn().mockResolvedValue([]),
    linkGapToIssue: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn(),
    interrogate: vi.fn(),
  } as unknown as InterrogationService;
}

function mockEngine() {
  return {
    createEntity: vi.fn().mockResolvedValue({ id: "entity-1" }),
  } as unknown as Engine;
}

const SAMPLE_GAPS = [
  {
    id: "g-1",
    capability: "ci",
    title: "Set up CI pipeline",
    priority: "high" as const,
    description: "No CI found.",
    status: "open",
    issueUrl: null,
  },
  {
    id: "g-2",
    capability: "docs",
    title: "Set up documentation",
    priority: "low" as const,
    description: "No docs.",
    status: "open",
    issueUrl: null,
  },
  {
    id: "g-3",
    capability: "testing",
    title: "Add tests",
    priority: "high" as const,
    description: "No tests.",
    status: "issue_created",
    issueUrl: "https://github.com/org/app/issues/99",
  },
];

describe("GapActualizationService", () => {
  let service: GapActualizationService;
  let interrogation: ReturnType<typeof mockInterrogationService>;
  let engine: ReturnType<typeof mockEngine>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    interrogation = mockInterrogationService();
    engine = mockEngine();
    service = new GapActualizationService({
      interrogationService: interrogation,
      engine,
      getGithubToken: async () => "ghp_test",
    });
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("creates a GitHub issue and links it back to the gap", async () => {
    vi.mocked(interrogation.getGaps).mockResolvedValue(SAMPLE_GAPS);
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ number: 42, html_url: "https://github.com/org/app/issues/42" }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await service.createIssueFromGap("org/app", "g-1");

    expect(result.issueNumber).toBe(42);
    expect(result.issueUrl).toBe("https://github.com/org/app/issues/42");
    expect(result.gapId).toBe("g-1");
    expect(result.entityId).toBeUndefined();

    // Verify GitHub API call
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/org/app/issues");
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.title).toBe("[Holy Ship] Set up CI pipeline");
    expect(body.labels).toContain("holyship");
    expect(body.labels).toContain("priority: high");

    // Verify gap was linked
    expect(interrogation.linkGapToIssue).toHaveBeenCalledWith(
      "g-1",
      "org/app",
      "https://github.com/org/app/issues/42",
    );
  });

  it("creates entity when createEntity option is true", async () => {
    vi.mocked(interrogation.getGaps).mockResolvedValue(SAMPLE_GAPS);
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ number: 43, html_url: "https://github.com/org/app/issues/43" }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await service.createIssueFromGap("org/app", "g-1", { createEntity: true });

    expect(result.entityId).toBe("entity-1");
    expect(engine.createEntity).toHaveBeenCalledWith("engineering", undefined, {
      repoFullName: "org/app",
      issueNumber: 43,
      issueUrl: "https://github.com/org/app/issues/43",
      gapCapability: "ci",
      gapTitle: "Set up CI pipeline",
    });
  });

  it("rejects if gap not found", async () => {
    vi.mocked(interrogation.getGaps).mockResolvedValue(SAMPLE_GAPS);

    await expect(service.createIssueFromGap("org/app", "nonexistent")).rejects.toThrow("not found");
  });

  it("rejects if gap already has an issue", async () => {
    vi.mocked(interrogation.getGaps).mockResolvedValue(SAMPLE_GAPS);

    await expect(service.createIssueFromGap("org/app", "g-3")).rejects.toThrow(
      "already has an issue",
    );
  });

  it("rejects on GitHub API failure", async () => {
    vi.mocked(interrogation.getGaps).mockResolvedValue(SAMPLE_GAPS);
    fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    await expect(service.createIssueFromGap("org/app", "g-1")).rejects.toThrow("HTTP 404");
  });

  it("rejects if no GitHub token", async () => {
    service = new GapActualizationService({
      interrogationService: interrogation,
      engine,
      getGithubToken: async () => null,
    });
    vi.mocked(interrogation.getGaps).mockResolvedValue(SAMPLE_GAPS);

    await expect(service.createIssueFromGap("org/app", "g-1")).rejects.toThrow("No GitHub token");
  });

  it("createIssuesFromAllGaps creates issues for open gaps only", async () => {
    vi.mocked(interrogation.getGaps).mockResolvedValue(SAMPLE_GAPS);
    // Two open gaps → two fetch calls
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ number: 50, html_url: "https://github.com/org/app/issues/50" }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ number: 51, html_url: "https://github.com/org/app/issues/51" }),
          { status: 201 },
        ),
      );

    const results = await service.createIssuesFromAllGaps("org/app");

    expect(results).toHaveLength(2);
    expect(results[0].issueNumber).toBe(50);
    expect(results[1].issueNumber).toBe(51);
    // g-3 (status: issue_created) should be skipped
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("createIssuesFromAllGaps continues on individual failure", async () => {
    vi.mocked(interrogation.getGaps).mockResolvedValue(SAMPLE_GAPS);
    // First gap fails, second succeeds
    fetchSpy
      .mockResolvedValueOnce(new Response("Server Error", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ number: 51, html_url: "https://github.com/org/app/issues/51" }),
          { status: 201 },
        ),
      );

    const results = await service.createIssuesFromAllGaps("org/app");

    // Only 1 succeeded
    expect(results).toHaveLength(1);
    expect(results[0].issueNumber).toBe(51);
  });

  it("still returns issue if linkGapToIssue fails (idempotency)", async () => {
    vi.mocked(interrogation.getGaps).mockResolvedValue(SAMPLE_GAPS);
    vi.mocked(interrogation.linkGapToIssue).mockRejectedValueOnce(new Error("DB connection lost"));
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ number: 60, html_url: "https://github.com/org/app/issues/60" }),
        {
          status: 201,
        },
      ),
    );

    // Should NOT throw — issue was created on GitHub, link failure is logged
    const result = await service.createIssueFromGap("org/app", "g-1");
    expect(result.issueNumber).toBe(60);
    expect(result.issueUrl).toBe("https://github.com/org/app/issues/60");
  });

  it("batch does not re-fetch gaps per iteration (no N+1)", async () => {
    vi.mocked(interrogation.getGaps).mockResolvedValue(SAMPLE_GAPS);
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ number: 70, html_url: "url1" }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ number: 71, html_url: "url2" }), { status: 201 }),
      );

    await service.createIssuesFromAllGaps("org/app");

    // getGaps should be called exactly once (by createIssuesFromAllGaps), not per gap
    expect(interrogation.getGaps).toHaveBeenCalledTimes(1);
  });
});
