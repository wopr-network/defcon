import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../repositories/drizzle/schema.js";
import { integrationConfig } from "../repositories/drizzle/schema.js";
import type { IFlowRepository, IGateRepository } from "../repositories/interfaces.js";
import type { SeedFile } from "./zod-schemas.js";

type Db = BetterSQLite3Database<typeof schema>;

export async function exportSeed(flowRepo: IFlowRepository, gateRepo: IGateRepository, db: Db): Promise<SeedFile> {
  const flows = await flowRepo.listAll();

  // Build gate ID -> name map by scanning all transitions for gate references
  const gateIdToName = new Map<string, string>();
  for (const flow of flows) {
    for (const t of flow.transitions) {
      if (t.gateId && !gateIdToName.has(t.gateId)) {
        const gate = await gateRepo.get(t.gateId);
        if (gate) gateIdToName.set(gate.id, gate.name);
      }
    }
  }

  // Build gates array from all unique gate IDs found
  const gateEntries: SeedFile["gates"] = [];
  for (const [gateId] of gateIdToName) {
    const gate = await gateRepo.get(gateId);
    if (!gate) continue;
    if (gate.type === "command" && gate.command) {
      gateEntries.push({ name: gate.name, type: "command", command: gate.command, timeoutMs: gate.timeoutMs });
    } else if (gate.type === "function" && gate.functionRef) {
      gateEntries.push({ name: gate.name, type: "function", functionRef: gate.functionRef, timeoutMs: gate.timeoutMs });
    } else if (gate.type === "api" && gate.apiConfig) {
      gateEntries.push({ name: gate.name, type: "api", apiConfig: gate.apiConfig, timeoutMs: gate.timeoutMs });
    }
  }

  const seedFlows: SeedFile["flows"] = flows.map((f) => ({
    name: f.name,
    description: f.description ?? undefined,
    entitySchema: f.entitySchema ?? undefined,
    initialState: f.initialState,
    maxConcurrent: f.maxConcurrent,
    maxConcurrentPerRepo: f.maxConcurrentPerRepo,
    version: f.version,
    createdBy: f.createdBy ?? undefined,
  }));

  const seedStates: SeedFile["states"] = flows.flatMap((f) =>
    f.states.map((s) => ({
      name: s.name,
      flowName: f.name,
      agentRole: s.agentRole ?? undefined,
      modelTier: s.modelTier ?? undefined,
      mode: s.mode,
      promptTemplate: s.promptTemplate ?? undefined,
      constraints: s.constraints ?? undefined,
    })),
  );

  const seedTransitions: SeedFile["transitions"] = flows.flatMap((f) =>
    f.transitions.map((t) => ({
      flowName: f.name,
      fromState: t.fromState,
      toState: t.toState,
      trigger: t.trigger,
      gateName: t.gateId ? gateIdToName.get(t.gateId) : undefined,
      condition: t.condition ?? undefined,
      priority: t.priority,
      spawnFlow: t.spawnFlow ?? undefined,
      spawnTemplate: t.spawnTemplate ?? undefined,
    })),
  );

  const integrationRows = db.select().from(integrationConfig).all();
  const seedIntegrations: SeedFile["integrations"] = integrationRows.map((r) => ({
    capability: r.capability,
    adapter: r.adapter,
    config: (r.config as Record<string, unknown>) ?? undefined,
  }));

  return {
    flows: seedFlows,
    states: seedStates,
    gates: gateEntries,
    transitions: seedTransitions,
    integrations: seedIntegrations,
  };
}
