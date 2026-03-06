import { readFileSync } from "node:fs";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../repositories/drizzle/schema.js";
import { integrationConfig } from "../repositories/drizzle/schema.js";
import type { IFlowRepository, IGateRepository } from "../repositories/interfaces.js";
import { SeedFileSchema } from "./zod-schemas.js";

type Db = BetterSQLite3Database<typeof schema>;

export interface LoadSeedResult {
  flows: number;
  gates: number;
  integrations: number;
}

export async function loadSeed(
  seedPath: string,
  flowRepo: IFlowRepository,
  gateRepo: IGateRepository,
  db: Db,
): Promise<LoadSeedResult> {
  const raw = readFileSync(seedPath, "utf-8");
  const json = JSON.parse(raw);
  const parsed = SeedFileSchema.parse(json);

  // 1. Create gates first (transitions reference them by name)
  const gateNameToId = new Map<string, string>();
  for (const g of parsed.gates) {
    const gate = await gateRepo.create({
      name: g.name,
      type: g.type,
      command: "command" in g ? g.command : undefined,
      functionRef: "functionRef" in g ? g.functionRef : undefined,
      apiConfig: "apiConfig" in g ? g.apiConfig : undefined,
      timeoutMs: g.timeoutMs,
    });
    gateNameToId.set(g.name, gate.id);
  }

  // 2. Create flows, states, and transitions
  for (const f of parsed.flows) {
    const flow = await flowRepo.create({
      name: f.name,
      description: f.description,
      entitySchema: f.entitySchema,
      initialState: f.initialState,
      maxConcurrent: f.maxConcurrent,
      maxConcurrentPerRepo: f.maxConcurrentPerRepo,
      createdBy: f.createdBy,
    });

    const flowStates = parsed.states.filter((s) => s.flowName === f.name);
    for (const s of flowStates) {
      await flowRepo.addState(flow.id, {
        name: s.name,
        agentRole: s.agentRole,
        modelTier: s.modelTier,
        mode: s.mode,
        promptTemplate: s.promptTemplate,
        constraints: s.constraints,
      });
    }

    const flowTransitions = parsed.transitions.filter((t) => t.flowName === f.name);
    for (const t of flowTransitions) {
      await flowRepo.addTransition(flow.id, {
        fromState: t.fromState,
        toState: t.toState,
        trigger: t.trigger,
        gateId: t.gateName ? gateNameToId.get(t.gateName) : undefined,
        condition: t.condition,
        priority: t.priority,
        spawnFlow: t.spawnFlow,
        spawnTemplate: t.spawnTemplate,
      });
    }
  }

  // 3. Insert integrations
  for (const i of parsed.integrations) {
    db.insert(integrationConfig)
      .values({
        id: crypto.randomUUID(),
        capability: i.capability,
        adapter: i.adapter,
        config: i.config ?? null,
      })
      .run();
  }

  return {
    flows: parsed.flows.length,
    gates: parsed.gates.length,
    integrations: parsed.integrations.length,
  };
}
