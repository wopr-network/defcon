import type { IDomainEventRepository } from "../repositories/interfaces.js";
import type { EngineEvent, IEventBusAdapter } from "./event-types.js";

/** IEventBusAdapter that persists every engine event (except definition.changed) to the domain_events table. */
export class DomainEventPersistAdapter implements IEventBusAdapter {
  constructor(private readonly repo: IDomainEventRepository) {}

  async emit(event: EngineEvent): Promise<void> {
    // Skip events that have no entityId (e.g. definition.changed)
    if (!("entityId" in event) || !event.entityId) return;

    const {
      type,
      entityId,
      emittedAt: _emittedAt,
      ...rest
    } = event as EngineEvent & { entityId: string };
    await this.repo.append(type, entityId, rest as Record<string, unknown>);
  }
}
