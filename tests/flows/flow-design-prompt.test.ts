import { describe, expect, it } from "vitest";
import { parseFlowDesignOutput, renderFlowDesignPrompt } from "../../src/flows/flow-design-prompt.js";
import type { RepoConfig } from "../../src/flows/interrogation-prompt.js";

const SAMPLE_CONFIG: RepoConfig = {
  repo: "org/app",
  defaultBranch: "main",
  description: "A web app",
  languages: ["typescript"],
  monorepo: false,
  ci: { supported: true, provider: "github-actions", gateCommand: "pnpm lint && pnpm build && pnpm test" },
  testing: { supported: true, framework: "vitest", runCommand: "pnpm test" },
  linting: { supported: true, tool: "biome", runCommand: "pnpm lint" },
  formatting: { supported: true, tool: "biome", runCommand: "pnpm format" },
  typeChecking: { supported: true, tool: "tsc", runCommand: "pnpm check" },
  build: { supported: true, runCommand: "pnpm build" },
  reviewBots: { supported: false },
  docs: { supported: false },
  specManagement: { tracker: "github-issues" },
  security: {},
  intelligence: { hasClaudeMd: true, hasAgentsMd: false, conventions: ["conventional-commits"] },
};

const SAMPLE_DESIGN_OUTPUT = `Some AI reasoning text.

FLOW_DESIGN:{"flow":{"name":"engineering","description":"Custom flow for org/app","initialState":"spec","maxConcurrent":4,"maxConcurrentPerRepo":2,"affinityWindowMs":300000,"claimRetryAfterMs":30000,"gateTimeoutMs":120000,"defaultModelTier":"sonnet","maxInvocationsPerEntity":50},"states":[{"name":"spec","agentRole":"architect","modelTier":"sonnet","mode":"active","promptTemplate":"Design the feature."},{"name":"code","agentRole":"coder","modelTier":"sonnet","mode":"active","promptTemplate":"Implement the spec."},{"name":"review","agentRole":"reviewer","modelTier":"sonnet","mode":"active","promptTemplate":"Review the PR."},{"name":"fix","agentRole":"fixer","modelTier":"sonnet","mode":"active","promptTemplate":"Fix the issues."},{"name":"learning","agentRole":"learner","modelTier":"haiku","mode":"active","promptTemplate":"Extract patterns."},{"name":"merge","agentRole":"merger","modelTier":"haiku","mode":"active","promptTemplate":"Merge the PR."},{"name":"done","mode":"passive"},{"name":"stuck","mode":"passive"},{"name":"cancelled","mode":"passive"},{"name":"budget_exceeded","mode":"passive"}],"gates":[{"name":"spec-posted","type":"primitive","primitiveOp":"issue_tracker.comment_exists","primitiveParams":{"issueNumber":"{{entity.artifacts.issueNumber}}","pattern":"## Implementation Spec"},"timeoutMs":120000},{"name":"ci-green","type":"primitive","primitiveOp":"vcs.ci_status","primitiveParams":{"ref":"{{entity.artifacts.headSha}}"},"timeoutMs":600000,"outcomes":{"passed":{"proceed":true},"pending":{"toState":"review"},"failed":{"toState":"fix"}}}],"transitions":[{"fromState":"spec","toState":"code","trigger":"spec_ready","priority":0},{"fromState":"code","toState":"review","trigger":"pr_created","priority":0},{"fromState":"review","toState":"learning","trigger":"clean","priority":0},{"fromState":"review","toState":"fix","trigger":"issues","priority":0},{"fromState":"fix","toState":"review","trigger":"fixes_pushed","priority":0},{"fromState":"learning","toState":"merge","trigger":"learned","priority":0},{"fromState":"merge","toState":"done","trigger":"merged","priority":0}],"gateWiring":{"spec-posted":{"fromState":"spec","trigger":"spec_ready"},"ci-green":{"fromState":"code","trigger":"pr_created"}}}
DESIGN_NOTES:Removed docs state because docs.supported is false. Skipped review→docs transition, now review→learning directly.

flow_design_complete`;

describe("renderFlowDesignPrompt", () => {
  it("renders repo name and config into prompt", () => {
    const prompt = renderFlowDesignPrompt("org/app", SAMPLE_CONFIG);

    expect(prompt).toContain("org/app");
    expect(prompt).toContain('"languages": [\n    "typescript"\n  ]');
    expect(prompt).toContain("biome");
  });
});

describe("parseFlowDesignOutput", () => {
  it("parses a complete flow design output", () => {
    const result = parseFlowDesignOutput(SAMPLE_DESIGN_OUTPUT);

    expect(result.design.flow.name).toBe("engineering");
    expect(result.design.flow.initialState).toBe("spec");
    expect(result.design.states).toHaveLength(10);
    expect(result.design.gates).toHaveLength(2);
    expect(result.design.transitions).toHaveLength(7);
    expect(result.design.gateWiring["spec-posted"]).toEqual({ fromState: "spec", trigger: "spec_ready" });
    expect(result.notes).toContain("Removed docs state");
  });

  it("adds missing terminal states", () => {
    const output = `FLOW_DESIGN:{"flow":{"name":"minimal","description":"test","initialState":"code"},"states":[{"name":"code","mode":"active"},{"name":"done","mode":"passive"}],"gates":[],"transitions":[{"fromState":"code","toState":"done","trigger":"complete"}],"gateWiring":{}}
DESIGN_NOTES:Minimal flow.

flow_design_complete`;

    const result = parseFlowDesignOutput(output);

    const names = result.design.states.map((s) => s.name);
    expect(names).toContain("done");
    expect(names).toContain("stuck");
    expect(names).toContain("cancelled");
    expect(names).toContain("budget_exceeded");
  });

  it("throws on missing FLOW_DESIGN line", () => {
    expect(() => parseFlowDesignOutput("Just text.\n\nflow_design_complete")).toThrow("missing FLOW_DESIGN");
  });

  it("throws on missing flow name", () => {
    const output = `FLOW_DESIGN:{"flow":{"description":"bad"},"states":[{"name":"x"}],"gates":[],"transitions":[{"fromState":"x","toState":"x","trigger":"y"}],"gateWiring":{}}`;
    expect(() => parseFlowDesignOutput(output)).toThrow("missing required flow.name");
  });

  it("throws on empty states", () => {
    const output = `FLOW_DESIGN:{"flow":{"name":"x","initialState":"x"},"states":[],"gates":[],"transitions":[{"fromState":"x","toState":"x","trigger":"y"}],"gateWiring":{}}`;
    expect(() => parseFlowDesignOutput(output)).toThrow("missing states");
  });

  it("throws on empty transitions", () => {
    const output = `FLOW_DESIGN:{"flow":{"name":"x","initialState":"x"},"states":[{"name":"x"}],"gates":[],"transitions":[],"gateWiring":{}}`;
    expect(() => parseFlowDesignOutput(output)).toThrow("missing transitions");
  });

  it("parses flow without docs state (docs.supported=false)", () => {
    const result = parseFlowDesignOutput(SAMPLE_DESIGN_OUTPUT);

    const stateNames = result.design.states.map((s) => s.name);
    expect(stateNames).not.toContain("docs");
    // review → learning directly (no docs in between)
    const reviewClean = result.design.transitions.find(
      (t) => t.fromState === "review" && t.trigger === "clean",
    );
    expect(reviewClean?.toState).toBe("learning");
  });
});
