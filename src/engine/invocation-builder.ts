import type { EnrichedEntity, Mode, State } from "../repositories/interfaces.js";
import { getHandlebars } from "./handlebars.js";

export interface InvocationBuild {
  prompt: string;
  agentRole: string | null;
  mode: Mode;
  context: Record<string, unknown>;
}

/**
 * Build an invocation's prompt and context from a state definition and entity.
 * Resolves entity refs through adapters (if provided) before rendering.
 */
export async function buildInvocation(
  state: State,
  entity: EnrichedEntity,
  adapters?: Map<string, unknown>,
): Promise<InvocationBuild> {
  const resolvedRefs: Record<string, unknown> = {};
  for (const [key, ref] of Object.entries(entity.refs ?? {})) {
    const adapter = adapters?.get(ref.adapter);
    if (adapter && typeof (adapter as Record<string, unknown>).get === "function") {
      try {
        resolvedRefs[key] = await (adapter as { get(id: string): Promise<unknown> }).get(ref.id);
      } catch (err) {
        console.warn(`[invocation-builder] Failed to resolve ref "${key}" via adapter "${ref.adapter}":`, err);
      }
    }
  }

  const context: Record<string, unknown> = { entity, state, refs: resolvedRefs };

  let prompt = "";
  if (state.promptTemplate) {
    const template = getHandlebars().compile(state.promptTemplate);
    prompt = template(context);
  }

  return {
    prompt,
    agentRole: state.agentRole,
    mode: state.mode,
    context,
  };
}
