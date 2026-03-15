# Holy Ship Platform Design

**Date:** 2026-03-14
**Status:** Draft (post-review)
**Domains:** holyship.dev, holyship.wtf

## Overview

Holy Ship is a guaranteed code shipping platform. Users install the Holy Ship GitHub App, point it at issues, and get merged PRs with gate-enforced correctness. "Hope is not a gate." GitHub only at launch.

The product is the consumer-facing brand for the holyship flow engine. Inference flows through platform-core's metered gateway, capturing arbitrage margin on every token.

## Product Position

| Product | Audience | What it does | Token pattern |
|---------|----------|-------------|---------------|
| WOPR | Bot deployers | AI bot platform | Per-conversation |
| Paperclip | Non-technical users | Managed bot hosting | Per-conversation |
| **Holy Ship** | Engineering teams | Guaranteed code shipping | Per-issue |

All products share: platform-core (auth, billing, credits, fleet, gateway), GPU infrastructure, and the inference arbitrage model.

## User Journey

1. **Sign up** — BetterAuth account creation, land on dashboard
2. **Get credits** — Stripe checkout or free signup credits via `grantSignupCredits()`
3. **Install GitHub App** — Install "Holy Ship" GitHub App on their repos. Platform stores `installation_id`. 10 seconds. This is the ONLY integration — GitHub for VCS and issues.
4. **Pick repo** — select which repo to watch
6. **Ship It** — either:
   - Toggle on webhooks for automated flow (issues auto-ingest)
   - Paste an issue URL and click "Ship It" for one-offs
7. **Watch it go** — live dashboard: issue claimed → spec → code → review → merge. Credits ticking.
8. **Get the PR** — merged PR in their repo. "Holy Ship, it worked."

Critical UX: steps 3-6 must be four clicks. That's where users drop off.

## Architecture

### Deployment Model

- **One shared holyship-platform instance** (not per-customer containers like Paperclip)
- Platform-core orgs provide tenant isolation via `tenantId`
- Ephemeral holyshipper containers provisioned per-issue via platform-core fleet management (`FleetManager.create()` / `fleet.remove()`)
- One Postgres database with both platform-core and holyship tables
- Holyshippers talk to platform-core's metered gateway for all LLM inference

### System Diagram

```
User (browser)
    └── holyship-ui (thin shell on platform-ui-core)
            └── holyship-platform (Hono server)
                    ├── platform-core: auth, billing, credits, orgs, fleet, gateway
                    ├── flow engine: state machine, gates, claim/report
                    ├── GitHub App: issues + VCS (only integration at launch)
                    ├── ingestion: GitHub webhooks + manual "Ship It"
                    ├── fleet: provisions ephemeral holyshipper containers
                    │       └── holyshipper containers (per-issue, stateless)
                    │               ├── claims work from holyship-platform
                    │               ├── runs Claude agent (architect/coder/reviewer)
                    │               ├── LLM calls → gateway → metered → credits
                    │               ├── Git push via GitHub App installation token
                    │               ├── reports signal + artifacts back
                    │               └── tears down when issue completes
                    └── Postgres (shared: platform-core + holyship tables)
```

### Inference Revenue Flow

Holyshipper containers receive a **platform-core service key**, not a real API key. All LLM calls route through the gateway:

```
Holyshipper → ANTHROPIC_BASE_URL (gateway) → upstream provider
                    ↓
              serviceKeyAuth() → resolve org
              metering → count tokens
              ledger.debit() → burn credits
              margin captured
```

### VCS Credential Flow (GitHub App Model)

Holyshippers need to push code, create PRs, and read issues. This uses GitHub App installation tokens — short-lived, scoped, no customer secrets in containers:

1. Customer installs "Holy Ship" GitHub App on their repos during onboarding
2. Platform stores the `installation_id` (not a token, not a secret)
3. At holyshipper provision time, platform generates a 1-hour installation access token via `POST /app/installations/{installation_id}/access_tokens`
4. Token injected as env var — works for both REST API and `git push` over HTTPS
5. GitHub App private key stays on the platform server — only ephemeral tokens leave
6. If work exceeds 1 hour, holyshipper calls back to platform for a fresh token

Container env:
```
ANTHROPIC_API_KEY=<gateway-service-key>        # not a real API key
ANTHROPIC_BASE_URL=https://gateway.holyship.dev/v1
HOLYSHIP_URL=https://api.holyship.dev          # claim/report
HOLYSHIP_WORKER_TOKEN=<per-container-token>    # scoped to tenant, short-lived, revoked on teardown
GITHUB_TOKEN=<installation-access-token>       # 1-hour TTL, scoped to customer's repos
```

## Repos

| Repo | Path | Package | Purpose |
|------|------|---------|---------|
| wopr-network/holyship | ~/holyship | @wopr-network/holyship | Flow engine + platform server |
| wopr-network/holyship-ui | rebuild from scratch | — | Thin shell on platform-ui-core |
| wopr-network/holyshipper | ~/holyshipper | @wopr-network/holyshipper | Stateless agent containers |
| wopr-network/platform-core | ~/platform-core | @wopr-network/platform-core | Auth, billing, fleet, gateway |
| wopr-network/platform-ui-core | ~/platform-ui-core | @wopr-network/platform-ui-core | Brand-agnostic UI |

## What Changes in Holyship

### Rip Out

| Component | Replaced by |
|-----------|-------------|
| `HOLYSHIP_ADMIN_TOKEN` / `HOLYSHIP_WORKER_TOKEN` bearer auth | platform-core BetterAuth sessions + scoped API tokens + service keys |
| `createScopedRepos(db, tenantId)` hand-rolled tenant isolation | `tenantId` from platform-core session — same scoped repos, platform-core resolves the tenant |
| Tenant cache in `src/api/hono-server.ts` | Platform-core middleware resolves tenantId |
| Hand-rolled rate limiting (DB token bucket) | Platform-core `rateLimit()` / `rateLimitByRoute()` |
| Hand-rolled CORS | Platform-core CORS middleware |
| `ClaimHandler` + `InMemoryWorkerRepo` | Holyshippers call claim/report API directly |
| `NukeDispatcher` / `SdkDispatcher` / `ClaudeCodeDispatcher` | Holyshipper IS the dispatcher |
| Run-loop / worker pool / slots (`src/run-loop/`, `src/pool/`) | Platform-core fleet provisions holyshippers |
| `src/claim/claim-handler.ts` | Direct claim endpoint |
| `onEnter` worktree provisioning (`vcs.provision_worktree`) | Holyshipper container IS the workspace — clone at startup, no worktree management |
| `src/integrations/` (adapter registry, multi-provider) | GitHub App only — no generic adapter layer needed |
| `src/sources/` (source adapters, watches, polling) | GitHub webhook handler only — no generic event routing |
| Sources/watches/eventLog tables | GitHub App installation table replaces all of this |

### Keep As-Is

| Component | Why |
|-----------|-----|
| `Engine` class (`src/engine/engine.ts`) | Core value. ~1100 lines of battle-tested state machine. |
| `state-machine.ts` | Pure deterministic logic — transition matching, condition evaluation, flow validation |
| Gate evaluator | Quality gates — but primitive ops (`vcs.*`, `issue_tracker.*`) rewritten as direct GitHub API calls instead of adapter-abstracted operations |
| Repository interfaces (`src/repositories/interfaces.ts`) | Clean contracts: IEntityRepository, IFlowRepository, IInvocationRepository, IGateRepository |
| Drizzle schema + repo implementations | Move tables into shared Postgres alongside platform-core. Drop integrations/sources/watches/eventLog tables. Add github_installations. |
| Wire types (`ClaimResponse`, `ReportResponse`) | API contract holyshippers depend on |
| `HolyshipClient` (`src/holyship-client/`) | How holyshippers talk to the platform |
| Event bus + domain events | Audit trail, SSE streaming to UI |
| Flow spawning | Parent flows spawn child flows |
| Concurrency controls | `maxConcurrent`, `maxConcurrentPerRepo` |

### Add New

| Component | What |
|-----------|------|
| `@wopr-network/platform-core` dependency | Auth, billing, fleet, gateway, orgs, tRPC |
| Boot sequence | DB → migrations → auth → billing → engine → webhooks → gateway → serve() |
| Platform-core tenant middleware | Resolve tenantId from BetterAuth session, scope all engine operations |
| Per-entity metering | Gateway meters tokens per LLM call (tied to tenant via service key). Entity-level aggregation via meter_events for dashboard display. No double-charging — gateway is the single billing point. |
| Service key generation | Per-holyshipper container gateway key tied to org. Short-lived. Revoked on container teardown. |
| GitHub App installation token generation | Platform generates 1-hour tokens at provision time for Git operations |
| Fleet integration | On webhook/button → fleet provisions holyshipper → container claims work → tears down |
| **Spending caps** | Max credits per entity and max invocations per entity. Engine checks before creating invocations. Prevents runaway gate loops from draining credits. Configurable per-flow. |
| tRPC routers | Platform-core billing/tenant/profile routers + holyship flow/entity routers |
| GitHub webhook receiver | GitHub App webhook endpoint for issue events |
| GitHub App install flow | Onboarding UX — install app, pick repos, done |

## Spending Caps

Runaway protection against gate loops that burn credits forever:

- **`maxCreditsPerEntity`** — flow-level setting. Engine checks tenant credit balance before creating invocations. Entity transitions to `budget_exceeded` terminal state when limit hit.
- **`maxInvocationsPerEntity`** — flow-level setting. Hard limit on total invocations per entity. Prevents infinite retry loops.
- **Per-tenant spending caps** — platform-core's existing `spending-cap-store.ts` enforces tenant-level daily/monthly limits at the gateway. Already built.

## Holyshipper Lifecycle

Per-issue, ephemeral:

1. **Trigger** — webhook from issue tracker OR user clicks "Ship It"
2. **Ingest** — holyship-platform creates entity in flow, creates initial invocation
3. **Provision** — platform-core fleet creates holyshipper container with:
   - Gateway service key (for metered LLM calls, tied to org)
   - Worker token (for claim/report auth, scoped, short-lived)
   - GitHub App installation token (for Git push + API, 1-hour TTL)
   - Holyship platform URL
   - Discipline-specific tooling (coder has `gh`, `git`; devops has `curl`, etc.)
4. **Clone** — holyshipper clones the target repo at startup (container IS the workspace)
5. **Claim** — holyshipper POSTs to `/api/claim` → gets prompt, context, model tier
6. **Execute** — holyshipper runs Claude agent with the prompt. LLM calls go through gateway.
7. **Report** — holyshipper POSTs to `/api/entities/:id/report` with signal + artifacts
8. **Gate** — engine evaluates gate (CI passed? PR clean? Spec posted?)
   - Gate passes → transition to next state → new invocation → holyshipper claims again (step 5)
   - Gate fails → engine creates new invocation with failure context → holyshipper claims again
   - Spending cap hit → entity moves to `budget_exceeded` terminal state
   - Terminal state reached → done
9. **Teardown** — fleet destroys holyshipper container. Service key + worker token revoked. Credits metered.

A single issue may cycle through multiple holyshipper invocations (architect → coder → reviewer → fixer → reviewer → merger) with different disciplines. Each is a separate container or the same container claiming the next invocation.

## Database

One Postgres instance. Two table groups in the same database. Both scoped by `tenantId` from platform-core.

**Platform-core tables** (existing):
- users, sessions, accounts (BetterAuth)
- organizations, org_members
- accounts, journal_entries, journal_lines (double-entry ledger)
- credit_transactions, credit_balances
- meter_events, usage_summaries
- bot_instances, bot_profiles, nodes (fleet)
- api_keys, service_keys

**Holyship tables** (from current schema, tenantId scoping):
- flow_definitions, state_definitions, transition_rules, gate_definitions
- entities, invocations, gate_results, entity_history
- domain_events, entity_snapshots
- github_installations (installation_id per tenant — no encrypted secrets, just the ID)
- flow_versions

Both managed by Drizzle. Migrations run on startup (idempotent).

## Holyship UI

**Dead:** Current holyship-ui (formerly norad) is a standalone Next.js app that predates platform-ui-core. Thrown away.

**New:** Thin shell on `@wopr-network/platform-ui-core`, same pattern as paperclip-platform-ui:

- `setBrandConfig()` with Holy Ship branding
- Auth, billing, settings pages inherited from core
- Holy Ship-specific pages:
  - **Connect** — GitHub App install flow, pick repos
  - **Dashboard** — issues in flight, shipped, stuck, credits burned
  - **Activity** — live SSE feed of agents working
  - **Ship It** — issue URL paste + button
  - **Settings** — repos, flow config (advanced)

Brand:
- Button: "Ship It"
- Loading: "Shipping..."
- Success: "Holy Ship, it worked."
- holyship.wtf redirects to holyship.dev

## Implementation Order

Clean cut. Rip out the old, wire in the new.

1. **Add platform-core dependency to holyship** — wire auth, billing, gateway into boot sequence.
2. **Replace hand-rolled tenant isolation** — rip out tenant cache + bearer tokens, use platform-core session middleware.
3. **Add fleet integration** — provision holyshipper containers on webhook/button.
4. **Add gateway service key generation** — per-container keys for metered inference
5. **Add GitHub App installation token generation** — platform generates tokens at provision time
6. **Add spending caps** — max credits + max invocations per entity
7. **Add per-entity metering** — gateway meters tokens, entity-level aggregation for dashboard
8. **Add GitHub webhook receiver** — GitHub App webhook endpoint for issue events
9. **Rip out old systems** — run-loop, worker pool, dispatchers, ClaimHandler, integrations adapter layer, sources/watches
10. **Add tRPC routers** — flow/entity management for the UI
11. **Build holyship-ui** — thin shell on platform-ui-core with Holy Ship pages
12. **GitHub App install flow** — onboarding UX
13. **Landing page** — holyship.dev

## Success Criteria

- User signs up, installs GitHub App, ships first issue in under 5 minutes
- Every LLM token flows through gateway with margin captured
- Gates enforce correctness — no broken PRs merged
- Ephemeral holyshippers — zero idle containers, zero wasted compute
- Credits system works end-to-end: buy → burn → see balance
- Spending caps prevent runaway credit drain
- Live dashboard shows issue progress in real time
- No customer secrets in holyshipper containers — only ephemeral tokens
