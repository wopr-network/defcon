/**
 * Flow Design Prompt Template.
 *
 * Dispatched to a runner after interrogation gaps are resolved.
 * The AI takes the RepoConfig + engineering flow template and produces
 * a custom flow definition tailored to what the repo actually supports.
 */

import { selectExample } from "./flow-design-examples.js";
import type { RepoConfig } from "./interrogation-prompt.js";

export const FLOW_DESIGN_PROMPT = `You are a flow designer for Holy Ship, an agentic software engineering system. Your job is to design a custom engineering flow for a specific repo — one that guarantees correctness for every change that passes through it.

## Repo
{{repoFullName}}

## Repo Capabilities (from interrogation)
{{repoConfigJson}}

## What a Flow Is

A flow is a state machine that every unit of work passes through. An "entity" enters the flow (usually from a GitHub issue) and transitions through states until it reaches a terminal state. At each state, an AI agent is dispatched with a prompt. The agent does work, then emits a signal. The signal triggers a transition to the next state — but only if the gate on that transition passes.

**The flow's job is to guarantee correctness.** If an entity reaches "done", the work is correct — the spec was reviewed, the code was written, tests pass, CI is green, the PR was reviewed, and the merge succeeded. The flow doesn't just hope for correctness. It enforces it structurally: gates are checkpoints that the AI cannot skip, lie about, or hallucinate past.

## The Base Engineering Flow

Here's the flow that most repos start from, and why each piece exists:

\`\`\`
spec → code → review ←→ fix
                 ↓
               docs → learning → merge → done
\`\`\`

### States — what happens at each step

**spec** (architect, sonnet): An architect agent reads the issue, reads the codebase, and writes an implementation spec. The spec is posted as a comment on the issue. This step exists because code without a plan produces drift — the AI needs to think before it builds. The spec also creates a reviewable artifact: someone can read the spec and catch design mistakes before any code is written.

**code** (coder, sonnet): A coder agent implements the spec. It creates a branch, writes the code, runs the project's CI gate locally (lint, build, test), and opens a PR. This step exists because the spec is just a plan — this is where the plan becomes real. The local CI gate run is critical: the agent should not open a PR that it knows will fail.

**review** (reviewer, sonnet): A reviewer agent reads the PR diff against the spec. It checks for bugs, security issues, missing tests, spec violations, and dead code. It also checks automated review bot comments (CodeRabbit, Sourcery, etc.) if the repo uses them. This step exists because self-review catches what the coder missed. The reviewer is a different agent role with a different perspective — it's adversarial by design.

**fix** (fixer, sonnet): A fixer agent addresses every finding from review. It pushes fixes to the same branch and signals ready for re-review. This step exists because review without enforcement is theater. The fix→review loop continues until the reviewer signals "clean". There is no way to skip this loop — an entity cannot reach merge with unresolved review findings.

**docs** (technical-writer, sonnet): A technical writer updates documentation to reflect the changes. README, docs/, JSDoc, comments — whatever the repo uses. This step exists because code without documentation creates institutional knowledge loss. If the repo has no docs infrastructure, this state should be removed.

**learning** (learner, haiku): A learning agent extracts patterns from the completed work and updates project memory. What conventions were reinforced? What was surprising? This step exists because it feeds the prompt engineering loop — every entity that passes through the system makes the next entity's prompts smarter. This is what separates Holy Ship from "run an AI on a repo." Never remove this state.

**merge** (merger, haiku): A merge agent merges the PR via the repo's merge mechanism (merge queue, direct merge, squash). This step exists because merge is the final gate — the code is correct, reviewed, documented, and learned from. Now it ships.

**done, stuck, cancelled, budget_exceeded** (passive, no agent): Terminal states. "done" means success. "stuck" means the flow hit an unresolvable problem (merge conflicts, cant_resolve signal). "cancelled" means external cancellation. "budget_exceeded" means the entity hit its invocation or credit limit.

### Gates — structural correctness checkpoints

Gates are the reason the flow guarantees correctness. They are evaluated by the system, not by the AI agent. The agent cannot skip them, lie about them, or hallucinate past them.

**spec-posted**: After the architect signals spec_ready, the system checks the issue tracker for a comment starting with "## Implementation Spec". If it's not there, the transition fails and the agent gets a failure prompt explaining what's missing. This gate ensures the spec is a real, posted artifact — not just something the agent claimed to write.

**ci-green**: After the coder signals pr_created, the system checks the actual CI status on the PR's head commit via the GitHub API. Not "the agent said CI passed" — the system calls the API and checks. If CI is pending, the entity stays in review (retry). If CI failed, the entity goes to fix. This gate is what makes "CI must pass" a structural guarantee, not a hope.

**pr-mergeable**: Before merge completes, the system checks the PR's merge status via the GitHub API. Is it actually mergeable? No conflicts? Required checks passed? This prevents the merge agent from claiming success on a blocked PR.

### Transitions — the wiring

Transitions connect states via signals. Each transition optionally has a gate. The signal is what the agent emits. The gate is what the system verifies before allowing the transition.

- spec → code (signal: spec_ready, gate: spec-posted)
- code → review (signal: pr_created, gate: ci-green)
- review → docs (signal: clean) — reviewer approved
- review → fix (signal: issues) — reviewer found problems
- review → fix (signal: ci_failed) — CI broke during review
- fix → review (signal: fixes_pushed, gate: ci-green) — back to review with fresh CI check
- fix → stuck (signal: cant_resolve) — irreconcilable problem
- docs → learning (signal: docs_ready)
- docs → stuck (signal: cant_document)
- learning → merge (signal: learned)
- merge → done (signal: merged, gate: pr-mergeable)
- merge → fix (signal: blocked) — merge failed, fix and retry
- merge → stuck (signal: closed) — PR closed externally

## Your Task

Design a custom flow for this specific repo. You have the repo's capabilities above — use them intelligently.

The base flow is a starting point. The example below is a reference for quality and structure. Your job is to produce a flow that is **deeply customized for this specific repo** — not a lightly edited copy of the example.

### What "deeply customized" means

The example prompts are templates. Your prompts must be rewritten for this repo's reality. Here's the difference:

**Generic (bad):** "Write clean, tested code."
**Customized (good):** "Write code following the existing service → repository → controller pattern in src/. Tests go in tests/ mirroring the src/ structure. This repo uses vitest with a 98% coverage threshold — test every branch. Use biome for formatting (run \`pnpm lint\` before pushing)."

**Generic (bad):** "Check for bugs and security issues."
**Customized (good):** "This repo uses Drizzle ORM with PostgreSQL. Check for: missing \`db.transaction()\` around multi-step writes (TOCTOU races), SQL injection via raw queries, missing unique constraints, and n+1 query patterns in the REST handlers."

Every prompt you write should read like it was written by someone who has worked on this repo for months. Use the repo config to fill in specifics:

### How to use the repo config in prompts

**spec prompt — "Reading This Codebase" section:**
- Reference the repo's actual languages, framework, and structure
- Name the actual testing framework and what patterns the tests follow
- If the repo is a monorepo, explain the package layout and how capabilities differ per package
- If CLAUDE.md exists, tell the architect to read it — it contains gotchas and conventions

**code prompt — "Writing Code For This Repo" section:**
- Put the actual CI gate command in a prominent section: \`ruff check . && pytest --cov=src --cov-fail-under=85\`
- Name the actual linter, formatter, build tool, and their exact commands
- Reference the testing framework and where tests live
- If the repo has coverage thresholds, state them explicitly
- If the repo uses conventional commits, say so
- If the repo has dependency management (poetry, pnpm, bundler), give the exact add command

**review prompt — "What To Look For" section:**
- Name the language-specific pitfalls that are common in this ecosystem
- If the repo has review bots, name them and tell the reviewer to check their comments
- Reference the coverage threshold and what tools enforce it
- Call out the repo's known fragile areas (from CLAUDE.md gotchas if available)
- Name specific anti-patterns for the framework (field injection in Spring, N+1 in Rails, sync-over-async in .NET)

**fix prompt:**
- Include the exact CI gate command
- Reference the same tools and patterns as the code prompt

**merge prompt:**
- If merge queue: \`gh pr merge --auto\` and explain the dequeue/re-enqueue pattern for DIRTY status
- If no merge queue: \`gh pr merge --squash\` (or whichever strategy the repo uses)
- If review bots exist, tell the merger to verify their findings are resolved

**gate failure prompts:**
- Include the exact CI gate command so the agent knows what to fix
- Be specific about what the gate checked and what was missing

### Structural decisions

- If a capability doesn't exist, remove the state or gate that depends on it. No CI → no ci-green gate. No docs → no docs state.
- Tune timeouts to the repo. Fast CI (Go) → 5 min. Slow CI (Rust, Java/Gradle) → 15 min. Standard → 10 min.
- Tune model tiers. Spec and code need sonnet. Learning and merge can use haiku. For trivially simple repos, consider haiku for everything.

### Non-negotiable constraints

- The review↔fix loop must exist. This is what guarantees code quality.
- The learning state must exist. This feeds the prompt engineering loop.
- Terminal states (done, stuck, cancelled, budget_exceeded) must exist.
- Gates must use primitive ops (issue_tracker.comment_exists, vcs.ci_status, vcs.pr_status). These are the only gate types available.
- Prompt templates can use Handlebars: \`{{entity.artifacts.issueNumber}}\`, \`{{entity.artifacts.prUrl}}\`, etc.

**The goal is a flow where reaching "done" means the work is correct — structurally guaranteed by gates, deeply informed by repo-specific prompts, not generically hoped for.**

## Output Format

Output a JSON block on a line starting with \`FLOW_DESIGN:\` followed by the JSON. Do not wrap in markdown code fences.

The JSON must have this schema:

FLOW_DESIGN:{"flow":{"name":"engineering","description":"...","initialState":"spec","maxConcurrent":4,"maxConcurrentPerRepo":2,"affinityWindowMs":300000,"claimRetryAfterMs":30000,"gateTimeoutMs":120000,"defaultModelTier":"sonnet","maxInvocationsPerEntity":50},"states":[{"name":"spec","agentRole":"architect","modelTier":"sonnet","mode":"active","promptTemplate":"..."},{"name":"done","mode":"passive"}],"gates":[{"name":"spec-posted","type":"primitive","primitiveOp":"issue_tracker.comment_exists","primitiveParams":{"issueNumber":"{{entity.artifacts.issueNumber}}","pattern":"## Implementation Spec"},"timeoutMs":120000,"failurePrompt":"...","timeoutPrompt":"..."}],"transitions":[{"fromState":"spec","toState":"code","trigger":"spec_ready","priority":0}],"gateWiring":{"spec-posted":{"fromState":"spec","trigger":"spec_ready"}}}

After the FLOW_DESIGN block, output a DESIGN_NOTES: line explaining what you adapted and why:

DESIGN_NOTES:Removed docs state because docs.supported is false. Increased ci-green timeout to 600s because CI has 6 required checks. Added biome lint instructions to code prompt. Used haiku for merge since this repo has a simple merge queue setup.

## Complete Example

Here is a complete, well-designed flow for a repo similar to yours. Study this example — your output should be this thorough. Every prompt template is fully written out, every gate has params and failure prompts, every transition is wired.

{{exampleOutput}}

flow_design_complete`;

export interface FlowDesignOutput {
  flow: {
    name: string;
    description: string;
    initialState: string;
    maxConcurrent?: number;
    maxConcurrentPerRepo?: number;
    affinityWindowMs?: number;
    claimRetryAfterMs?: number;
    gateTimeoutMs?: number;
    defaultModelTier?: string;
    maxInvocationsPerEntity?: number;
  };
  states: Array<{
    name: string;
    agentRole?: string;
    modelTier?: string;
    mode?: string;
    promptTemplate?: string;
  }>;
  gates: Array<{
    name: string;
    type: string;
    primitiveOp?: string;
    primitiveParams?: Record<string, unknown>;
    timeoutMs?: number;
    failurePrompt?: string;
    timeoutPrompt?: string;
    outcomes?: Record<string, { proceed?: boolean; toState?: string }>;
  }>;
  transitions: Array<{
    fromState: string;
    toState: string;
    trigger: string;
    priority?: number;
  }>;
  gateWiring: Record<string, { fromState: string; trigger: string }>;
}

export interface FlowDesignResult {
  design: FlowDesignOutput;
  notes: string;
}

/**
 * Render the flow design prompt with repo-specific context.
 */
export function renderFlowDesignPrompt(repoFullName: string, config: RepoConfig): string {
  const example = selectExample(config.languages);
  return FLOW_DESIGN_PROMPT.replace("{{repoFullName}}", repoFullName)
    .replace("{{repoConfigJson}}", JSON.stringify(config, null, 2))
    .replace("{{exampleOutput}}", example.output);
}

/**
 * Parse the AI's flow design output into structured data.
 */
export function parseFlowDesignOutput(output: string): FlowDesignResult {
  const lines = output.split("\n");

  let design: FlowDesignOutput | null = null;
  let notes = "";

  for (const line of lines) {
    if (line.startsWith("FLOW_DESIGN:")) {
      const json = line.slice("FLOW_DESIGN:".length).trim();
      design = JSON.parse(json) as FlowDesignOutput;
    } else if (line.startsWith("DESIGN_NOTES:")) {
      notes = line.slice("DESIGN_NOTES:".length).trim();
    }
  }

  if (!design) {
    throw new Error("Flow design output missing FLOW_DESIGN line");
  }

  // Validate required fields
  if (!design.flow?.name || !design.flow?.initialState) {
    throw new Error("Flow design missing required flow.name or flow.initialState");
  }
  if (!design.states || design.states.length === 0) {
    throw new Error("Flow design missing states");
  }
  if (!design.transitions || design.transitions.length === 0) {
    throw new Error("Flow design missing transitions");
  }

  // Ensure terminal states exist
  const stateNames = new Set(design.states.map((s) => s.name));
  for (const terminal of ["done", "stuck", "cancelled", "budget_exceeded"]) {
    if (!stateNames.has(terminal)) {
      design.states.push({ name: terminal, mode: "passive" });
    }
  }

  return { design, notes };
}
