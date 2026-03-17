/**
 * Flow Edit Prompt Template.
 *
 * Dispatched to a runner when a user wants to modify an existing flow via natural language.
 * The AI edits the YAML based on the user's request and outputs structured markers.
 *
 * Similar pattern to interrogation-prompt.ts — line-prefix markers for structured parsing.
 */

import type { RepoConfig } from "./interrogation-prompt.js";

/**
 * Build the LLM prompt for conversational flow editing.
 *
 * @param currentYaml - The current flow YAML (may be empty for new flows)
 * @param userMessage - What the user wants to change
 * @param repoConfig - Optional repo context to inform the edit
 */
export function renderFlowEditPrompt(currentYaml: string, userMessage: string, repoConfig?: RepoConfig): string {
  const repoSection = repoConfig
    ? `## Repo Context
Repo: ${repoConfig.repo}
Branch: ${repoConfig.defaultBranch}
CI gate: ${repoConfig.ci.gateCommand ?? "unknown"}
Languages: ${repoConfig.languages.join(", ")}

`
    : "";

  const yamlSection = currentYaml.trim()
    ? `## Current Flow YAML
${currentYaml.trim()}

`
    : `## Current Flow YAML
(empty — this is a new flow)

`;

  return `You are a flow editor. Your job is to modify a flow definition YAML based on the user's request.

A flow is a directed graph of states, transitions, and gates that guides an AI agent through a software engineering task.

${repoSection}${yamlSection}## User Request
${userMessage}

## Instructions

Output the full updated YAML, starting with \`UPDATED_YAML:\`:

UPDATED_YAML:
name: my-flow
description: ...
states:
  - name: start
    ...

Then output a short description of what you changed, starting with \`EXPLANATION:\`:

EXPLANATION: Added a review state between coding and merging, with a gate that checks CI status.

Then output a list of specific changes (one per line), prefixed with \`+\` (added), \`~\` (modified), or \`-\` (removed), starting with \`DIFF:\`:

DIFF:
+ state: review
~ transition: coding → review (was coding → merging)
- gate: skip-review

End with the signal:

edit_complete`;
}

/**
 * Result of parsing LLM flow-edit output.
 */
export interface FlowEditResult {
  updatedYaml: string;
  explanation: string;
  diff: string[];
}

/**
 * Parse raw LLM output from a flow-edit dispatch into structured data.
 * Scans lines for UPDATED_YAML:, EXPLANATION:, and DIFF: prefixes.
 */
export function parseFlowEditOutput(raw: string): FlowEditResult {
  const lines = raw.split("\n");

  let updatedYaml: string | null = null;
  let explanation = "";
  const diff: string[] = [];

  type Section = "none" | "yaml" | "diff";
  let section: Section = "none";
  const yamlLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === "edit_complete") break;

    if (line.startsWith("UPDATED_YAML:")) {
      section = "yaml";
      const rest = line.slice("UPDATED_YAML:".length);
      if (rest.trim()) yamlLines.push(rest.trimStart());
      continue;
    }

    if (line.startsWith("EXPLANATION:")) {
      section = "none";
      if (yamlLines.length > 0) {
        updatedYaml = yamlLines.join("\n").trim();
      }
      explanation = line.slice("EXPLANATION:".length).trim();
      continue;
    }

    if (line.startsWith("DIFF:")) {
      section = "diff";
      const rest = line.slice("DIFF:".length).trim();
      if (rest) diff.push(rest);
      continue;
    }

    if (section === "yaml") {
      yamlLines.push(line);
    } else if (section === "diff") {
      const trimmed = line.trim();
      if (trimmed) diff.push(trimmed);
    }
  }

  // Flush yaml if EXPLANATION never appeared
  if (updatedYaml === null && yamlLines.length > 0) {
    updatedYaml = yamlLines.join("\n").trim();
  }

  if (!updatedYaml) {
    throw new Error("Flow edit output missing UPDATED_YAML");
  }

  return { updatedYaml, explanation, diff };
}
