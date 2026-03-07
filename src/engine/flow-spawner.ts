import type { Entity, IEntityRepository, IFlowRepository, Transition } from "../repositories/interfaces.js";

/**
 * If the transition has a spawnFlow, look up that flow and create a new entity in it.
 * The spawned entity inherits the parent entity's refs.
 * Returns the spawned entity, or null if no spawn is configured.
 */
export async function executeSpawn(
  transition: Transition,
  parentEntity: Entity,
  flowRepo: IFlowRepository,
  entityRepo: IEntityRepository,
): Promise<Entity | null> {
  if (!transition.spawnFlow) return null;

  const flow = await flowRepo.getByName(transition.spawnFlow);
  if (!flow) throw new Error(`Spawn flow "${transition.spawnFlow}" not found`);

  const childEntity = await entityRepo.create(flow.id, flow.initialState, parentEntity.refs ?? undefined);

  // Re-fetch the parent from DB to avoid TOCTOU: the in-memory entity may be stale
  // if another spawn raced between the caller reading it and us writing.
  const freshParent = await entityRepo.get(parentEntity.id);
  const rawChildren = freshParent?.artifacts?.spawnedChildren;
  const existing = (Array.isArray(rawChildren) ? rawChildren : []).filter(
    (c): c is { childId: string; childFlow: string; spawnedAt: string } =>
      typeof c === "object" &&
      c !== null &&
      typeof (c as Record<string, unknown>).childId === "string" &&
      typeof (c as Record<string, unknown>).childFlow === "string" &&
      typeof (c as Record<string, unknown>).spawnedAt === "string",
  );

  try {
    await entityRepo.updateArtifacts(parentEntity.id, {
      spawnedChildren: [
        ...existing,
        { childId: childEntity.id, childFlow: transition.spawnFlow, spawnedAt: new Date().toISOString() },
      ],
    });
  } catch (err) {
    throw new Error(
      `updateArtifacts failed for parent ${parentEntity.id} after creating orphan child ${childEntity.id}: ${String(err)}`,
    );
  }

  return childEntity;
}
