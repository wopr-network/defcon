# DEFCON

You're a developer. You've been there.

You gave the AI a task. It came back fast — faster than you expected. The code looks right. The tests pass. You feel good. You merge it. You deploy. And then your phone buzzes at 2am because the thing the AI wrote handles the happy path perfectly and falls apart the moment a real user touches it.

Or you're running a team. You've got eight AI agents writing code in parallel and you're shipping faster than you ever have. The board is thrilled. The velocity charts are beautiful. And then one of those agents merges a change that breaks authentication in production. Not because it was malicious. Not because the model was bad. Because the pipeline between "code written" and "code in production" was a prompt that said *please be careful*. And the agent was careful — until it wasn't.

Or you're a Fortune 500 CTO. You've invested millions in AI-assisted development. The pitch was "10x productivity." And it delivered — until the first time an AI agent deployed untested code to your payment processing system and you spent the next 72 hours in an incident room explaining to regulators what happened. The AI did exactly what you asked. The problem was that nobody verified it did it *correctly* before it went live.

This is the problem with vibe coding. Not that the AI can't do the work. It can. The problem is what happens between "the work is done" and "the work is in production." That space is where software goes wrong. And right now, for most teams, that space is filled with hope.

**Hope is not a gate.**

---

In WarGames, WOPR escalated to launch because nothing in the system had the ability to say *not yet*. DEFCON 5. 4. 3. 2. 1. Each level a step closer, each step unchallenged. The system had no mechanism for doubt — only momentum.

AI pipelines have the same problem. They have momentum. What they lack is earned escalation — the structural requirement that each step *prove* it's ready before the next one begins.

**DEFCON is that structure.**

Each level in the pipeline is a question: *are we ready to go further?* Not asked in a prompt. Not left to the agent's judgment. Answered by a deterministic gate — a check that runs, passes or fails, and cannot be skipped. The pipeline doesn't move forward on confidence. It moves forward on evidence.

You don't get to DEFCON 3 without passing DEFCON 4. You don't get to DEFCON 2 without passing DEFCON 3. Each gate builds on the last. The system accumulates certainty the way the real DEFCON system accumulates readiness — one verified level at a time, until the answer to *are we sure?* isn't a feeling. It's a fact.

That's when you ship. Not before.

## The Engine

For a long time, the WOPR pipeline ran on `/wopr:auto` — a ~500-line skill prompt that hand-coded every state transition as an if-statement. "Spec ready" → spawn coder. "CLEAN" → merge. "ISSUES" → spawn fixer. Every new workflow type needed another hand-coded skill. The orchestration logic was frozen in prompts that agents couldn't modify at runtime.

DEFCON replaces that with a configurable state machine runtime. Define your escalation path once. The engine enforces it forever.

A **flow** is a state machine for any type of work. Entities (issues, deployments, incidents) enter a flow and move through states. At each state an agent does work. At each boundary a deterministic gate verifies the output. Transitions fire on signals — not parsed natural language, not regex, but typed strings agents emit via MCP tool call. The entire definition lives in a database. Agents can mutate it at runtime via the admin API. The pipeline's self-improvement loop becomes a literal API call.

```
/wopr:auto (before)          DEFCON (after)
────────────────────         ──────────────────────────────────
500-line skill prompt    →   JSON seed file
if-statement routing     →   signal → transition → gate → state
hand-coded CI check      →   shell gate: npm test
manual agent spawning    →   invocation lifecycle per state
message parsing          →   flow.report({ signal: "pr.created" })
stuck detection counter  →   conditional transition rule
slot counting            →   flow-level concurrency config
new workflow = new skill →   new flow definition in DB
```

The engine has two execution modes. **Passive**: Claude Code agents connect via MCP and pull work — `flow.claim()`, do the work, `flow.report()`. The engine manages state. **Active**: the engine calls AI provider APIs directly and runs the full pipeline autonomously. Stages can mix modes within the same flow.

The changeset flow seed in `seeds/wopr-changeset.json` is the direct replacement for `/wopr:auto`.

### `src/` — The Engine

```
src/
  engine/         state machine, gate evaluator, invocation builder, event emitter, flow spawner
  repositories/   interfaces + Drizzle/SQLite implementations
  execution/      MCP server (passive mode), active runner, CLI
  adapters/       Linear, GitHub, Anthropic, Discord, Webhook, Stdout
  config/         seed loader + Zod schemas
```

**Core dependencies:** `better-sqlite3`, `drizzle-orm`, `handlebars`, `@modelcontextprotocol/sdk`, `zod`

```bash
# Bootstrap from seed
npx defcon init --seed seeds/wopr-changeset.json

# Serve MCP (passive mode — agents pull work)
npx defcon serve

# Run autonomous pipeline (active mode)
npx defcon run --flow changeset

# Check pipeline state
npx defcon status
```

---

## What It Looks Like

```
Vibe Coding:  Human → AI → Hope → Production
DEFCON:       Human → AI → Gate → AI → Gate → AI → Gate → Production
```

Every transition is earned. Every gate is deterministic. Every failure feeds back into the system so the same mistake can't happen twice. The pipeline gets smarter over time — sprint 100 is easier than sprint 1 because the gates evolve.

## What's In This Repo

This repo ships three things: the principles, the proof, and the engine.

**[`docs/method/`](docs/method/)** — The principles. Tool-agnostic patterns for building gated AI pipelines. Why deterministic gates work. What the pipeline stages are. How agents, triggers, and gates compose. Read this to understand the methodology. Adopt it with whatever tools you use.

**[`docs/wopr/`](docs/wopr/)** — The proof. WOPR's concrete implementation of every principle — 14+ agent definitions, Discord as event bus, Linear as issue tracker, Biome + TypeScript + 4 review bots as gates, CLAUDE.md inheritance across 20+ repos. Every method/ doc has a [1:1 counterpart in wopr/](docs/wopr/) showing the real config.

**[`docs/adoption/`](docs/adoption/)** — The bridge. [Getting started](docs/adoption/getting-started.md), [checklist](docs/adoption/checklist.md), [migration guide](docs/adoption/migration-guide.md). How to go from reading about it to running it.

## Who This Is For

- **Developers** who've been burned by AI code that looked right and wasn't
- **Team leads** running multi-agent pipelines who need to know the output is safe to ship
- **Organizations** investing in AI-assisted development who can't afford the 2am phone call

## License

MIT
