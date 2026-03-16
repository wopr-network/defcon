import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { FlowDesignService } from "../../src/flows/flow-design-service.js";
import type { InterrogationService } from "../../src/flows/interrogation-service.js";

function mockInterrogationService() {
  return {
    getConfig: vi.fn(),
    getGaps: vi.fn(),
    interrogate: vi.fn(),
    linkGapToIssue: vi.fn(),
  } as unknown as InterrogationService;
}

function mockFleetManager() {
  return {
    provision: vi.fn().mockResolvedValue({ containerId: "ctr-456", runnerUrl: "http://runner:3001" }),
    teardown: vi.fn().mockResolvedValue(undefined),
  };
}

const SAMPLE_CONFIG = {
  repo: "org/app",
  defaultBranch: "main",
  description: "A web app",
  languages: ["typescript"],
  monorepo: false,
  ci: { supported: true },
  testing: { supported: true },
  linting: { supported: true },
  formatting: { supported: true },
  typeChecking: { supported: true },
  build: { supported: true },
  reviewBots: { supported: false },
  docs: { supported: false },
  specManagement: { tracker: "github-issues" },
  security: {},
  intelligence: { hasClaudeMd: true, hasAgentsMd: false, conventions: [] },
};

const SAMPLE_SSE = `data:${JSON.stringify({
  type: "result",
  artifacts: {
    output: `FLOW_DESIGN:{"flow":{"name":"engineering","description":"Custom for org/app","initialState":"spec","maxConcurrent":4,"defaultModelTier":"sonnet"},"states":[{"name":"spec","agentRole":"architect","mode":"active","promptTemplate":"Design it."},{"name":"code","agentRole":"coder","mode":"active","promptTemplate":"Build it."},{"name":"done","mode":"passive"},{"name":"stuck","mode":"passive"}],"gates":[{"name":"spec-posted","type":"primitive","primitiveOp":"issue_tracker.comment_exists","primitiveParams":{},"timeoutMs":120000}],"transitions":[{"fromState":"spec","toState":"code","trigger":"spec_ready"},{"fromState":"code","toState":"done","trigger":"merged"}],"gateWiring":{"spec-posted":{"fromState":"spec","trigger":"spec_ready"}}}
DESIGN_NOTES:Simplified flow — removed docs, review, merge for minimal demo.

flow_design_complete`,
  },
})}\n`;

describe("FlowDesignService", () => {
  let service: FlowDesignService;
  let interrogation: ReturnType<typeof mockInterrogationService>;
  let fleet: ReturnType<typeof mockFleetManager>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    interrogation = mockInterrogationService();
    fleet = mockFleetManager();
    service = new FlowDesignService({
      interrogationService: interrogation,
      fleetManager: fleet,
      getGithubToken: async () => "ghp_test",
      tenantId: "tenant-1",
      dispatchTimeoutMs: 5000,
    });
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("designs a flow from repo config", async () => {
    vi.mocked(interrogation.getConfig).mockResolvedValue({
      id: "cfg-1",
      config: SAMPLE_CONFIG,
      claudeMd: null,
    });
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_SSE, { status: 200 }));

    const result = await service.designFlow("org/app");

    expect(result.flow.name).toBe("engineering");
    expect(result.flow.initialState).toBe("spec");
    expect(result.states.length).toBeGreaterThanOrEqual(2);
    expect(result.gates).toHaveLength(1);
    expect(result.transitions.length).toBeGreaterThanOrEqual(2);
    expect(result.gateWiring["spec-posted"]).toBeDefined();
    expect(result.notes).toContain("Simplified");
  });

  it("throws if no repo config exists", async () => {
    vi.mocked(interrogation.getConfig).mockResolvedValue(null);

    await expect(service.designFlow("org/app")).rejects.toThrow("No repo config found");
  });

  it("tears down runner on dispatch failure", async () => {
    vi.mocked(interrogation.getConfig).mockResolvedValue({
      id: "cfg-1",
      config: SAMPLE_CONFIG,
      claudeMd: null,
    });
    fetchSpy.mockResolvedValueOnce(new Response("Error", { status: 500 }));

    await expect(service.designFlow("org/app")).rejects.toThrow("Dispatch failed");
    expect(fleet.teardown).toHaveBeenCalledWith("ctr-456");
  });

  it("tears down runner on parse failure", async () => {
    vi.mocked(interrogation.getConfig).mockResolvedValue({
      id: "cfg-1",
      config: SAMPLE_CONFIG,
      claudeMd: null,
    });
    const badSse = `data:${JSON.stringify({ type: "result", artifacts: { output: "no design here" } })}\n`;
    fetchSpy.mockResolvedValueOnce(new Response(badSse, { status: 200 }));

    await expect(service.designFlow("org/app")).rejects.toThrow("missing FLOW_DESIGN");
    expect(fleet.teardown).toHaveBeenCalledWith("ctr-456");
  });

  it("includes terminal states in output", async () => {
    vi.mocked(interrogation.getConfig).mockResolvedValue({
      id: "cfg-1",
      config: SAMPLE_CONFIG,
      claudeMd: null,
    });
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_SSE, { status: 200 }));

    const result = await service.designFlow("org/app");

    const stateNames = result.states.map((s) => s.name);
    expect(stateNames).toContain("done");
    expect(stateNames).toContain("stuck");
    // cancelled and budget_exceeded added by parser
    expect(stateNames).toContain("cancelled");
    expect(stateNames).toContain("budget_exceeded");
  });

  it("prompt contains repo config JSON", async () => {
    vi.mocked(interrogation.getConfig).mockResolvedValue({
      id: "cfg-1",
      config: SAMPLE_CONFIG,
      claudeMd: null,
    });
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_SSE, { status: 200 }));

    await service.designFlow("org/app");

    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.prompt).toContain("org/app");
    expect(body.prompt).toContain('"typescript"');
  });
});
