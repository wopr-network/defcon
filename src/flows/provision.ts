/**
 * Provision the built-in engineering flow for a tenant.
 *
 * Called once when a tenant signs up. Inserts the flow, all states,
 * all gates, and all transitions with gates wired up.
 *
 * The flow is opinionated — gates are non-negotiable. Users customize
 * via the pipeline configurator (toggle stages, add approval checkpoints).
 */

import type { IFlowRepository, IGateRepository } from "../repositories/interfaces.js";
import { ENGINEERING_FLOW, GATE_WIRING, GATES, STATES, TRANSITIONS } from "./engineering.js";

export async function provisionEngineeringFlow(
  flowRepo: IFlowRepository,
  gateRepo: IGateRepository,
): Promise<{ flowId: string }> {
  // Check if already provisioned (idempotent)
  const existing = await flowRepo.getByName(ENGINEERING_FLOW.name);
  if (existing) {
    return { flowId: existing.id };
  }

  // 1. Create the flow
  const flow = await flowRepo.create(ENGINEERING_FLOW);

  // 2. Add all states
  for (const state of STATES) {
    await flowRepo.addState(flow.id, state);
  }

  // 3. Create all gates
  const gateIds = new Map<string, string>();
  for (const gate of GATES) {
    const created = await gateRepo.create(gate);
    gateIds.set(gate.name, created.id);
  }

  // 4. Add all transitions, wiring gates where specified
  for (const transition of TRANSITIONS) {
    const wiring = Object.entries(GATE_WIRING).find(
      ([, w]) => w.fromState === transition.fromState && w.trigger === transition.trigger,
    );
    const gateId = wiring ? gateIds.get(wiring[0]) : undefined;
    await flowRepo.addTransition(flow.id, {
      ...transition,
      gateId,
    });
  }

  return { flowId: flow.id };
}
