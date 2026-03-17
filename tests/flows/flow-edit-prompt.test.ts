import { describe, expect, it } from "vitest";
import { parseFlowEditOutput, renderFlowEditPrompt } from "../../src/flows/flow-edit-prompt.js";
import type { RepoConfig } from "../../src/flows/interrogation-prompt.js";

const minimalRepoConfig: RepoConfig = {
  repo: "org/my-app",
  defaultBranch: "main",
  description: "A web API",
  languages: ["typescript"],
  monorepo: false,
  ci: { supported: true, gateCommand: "pnpm lint && pnpm test" },
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

describe("renderFlowEditPrompt", () => {
  it("includes userMessage and currentYaml in the output", () => {
    const yaml = "name: my-flow\nstates:\n  - name: coding";
    const prompt = renderFlowEditPrompt(yaml, "Add a review state");

    expect(prompt).toContain("Add a review state");
    expect(prompt).toContain("name: my-flow");
    expect(prompt).toContain("UPDATED_YAML:");
    expect(prompt).toContain("EXPLANATION:");
    expect(prompt).toContain("DIFF:");
    expect(prompt).toContain("edit_complete");
  });

  it("indicates new flow when currentYaml is empty", () => {
    const prompt = renderFlowEditPrompt("", "Create a new flow for code review");

    expect(prompt).toContain("new flow");
    expect(prompt).toContain("Create a new flow for code review");
  });

  it("includes repo context when repoConfig is provided", () => {
    const prompt = renderFlowEditPrompt("name: my-flow", "Add a gate", minimalRepoConfig);

    expect(prompt).toContain("org/my-app");
    expect(prompt).toContain("pnpm lint && pnpm test");
    expect(prompt).toContain("typescript");
  });

  it("omits repo section when repoConfig is not provided", () => {
    const prompt = renderFlowEditPrompt("name: my-flow", "Add a gate");

    expect(prompt).not.toContain("Repo Context");
    expect(prompt).not.toContain("CI gate:");
  });
});

describe("parseFlowEditOutput", () => {
  it("parses a complete output with yaml, explanation, and diff", () => {
    const raw = `I have analysed the flow and made the requested changes.

UPDATED_YAML:
name: my-flow
states:
  - name: coding
  - name: review
  - name: merging
transitions:
  - from: coding
    to: review
  - from: review
    to: merging
EXPLANATION: Added a review state between coding and merging.
DIFF:
+ state: review
~ transition: coding → merging (now coding → review)
+ transition: review → merging

edit_complete`;

    const result = parseFlowEditOutput(raw);

    expect(result.updatedYaml).toContain("name: my-flow");
    expect(result.updatedYaml).toContain("- name: review");
    expect(result.explanation).toBe("Added a review state between coding and merging.");
    expect(result.diff).toHaveLength(3);
    expect(result.diff[0]).toBe("+ state: review");
    expect(result.diff[1]).toBe("~ transition: coding → merging (now coding → review)");
    expect(result.diff[2]).toBe("+ transition: review → merging");
  });

  it("parses output with empty diff", () => {
    const raw = `UPDATED_YAML:
name: simple-flow
states:
  - name: working
EXPLANATION: Renamed the flow.
DIFF:

edit_complete`;

    const result = parseFlowEditOutput(raw);

    expect(result.updatedYaml).toContain("name: simple-flow");
    expect(result.explanation).toBe("Renamed the flow.");
    expect(result.diff).toHaveLength(0);
  });

  it("parses output when DIFF has inline content on the same line", () => {
    const raw = `UPDATED_YAML:
name: flow
EXPLANATION: Minor fix.
DIFF: ~ state name typo fixed

edit_complete`;

    const result = parseFlowEditOutput(raw);

    expect(result.diff).toHaveLength(1);
    expect(result.diff[0]).toBe("~ state name typo fixed");
  });

  it("throws on missing UPDATED_YAML", () => {
    const raw = `EXPLANATION: I tried to edit the flow.
DIFF:
+ something

edit_complete`;

    expect(() => parseFlowEditOutput(raw)).toThrow("missing UPDATED_YAML");
  });

  it("handles LLM preamble text before UPDATED_YAML", () => {
    const raw = `Sure! Here are the changes you requested.

After careful review, I will now output the updated YAML.

UPDATED_YAML:
name: preamble-flow
EXPLANATION: Added preamble handling.
DIFF:

edit_complete`;

    const result = parseFlowEditOutput(raw);

    expect(result.updatedYaml).toBe("name: preamble-flow");
    expect(result.explanation).toBe("Added preamble handling.");
  });

  it("stops at edit_complete signal", () => {
    const raw = `UPDATED_YAML:
name: my-flow
EXPLANATION: Done.
DIFF:

edit_complete

This trailing text should be ignored.`;

    const result = parseFlowEditOutput(raw);

    expect(result.updatedYaml).toBe("name: my-flow");
  });
});
