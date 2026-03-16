import { and, eq } from "drizzle-orm";
import type { EngineEvent, IEventBusAdapter } from "../engine/event-types.js";
import { logger } from "../logger.js";
import { holyshipperContainers } from "../repositories/drizzle/schema.js";
import type { IEntityRepository } from "../repositories/interfaces.js";
import type { IFleetManager, ProvisionConfig } from "./provision-holyshipper.js";

// biome-ignore lint/suspicious/noExplicitAny: cross-driver compat
type Db = any;

/**
 * Manages the lifecycle of ephemeral holyshipper containers.
 *
 * Each invocation gets its own container. The container lives for:
 *   prompt execution + gate evaluation
 * Then tears down on state transition (success or failure).
 *
 * Flow: invocation.created → provision → credentials → checkout → dispatch
 *       → signal → gate (via POST /gate to same container) → transition → teardown
 *
 * Gate failure triggers a transition (possibly back to same state with failure context),
 * which tears down the container. The next invocation provisions a fresh one.
 */
export class EntityLifecycleManager implements IEventBusAdapter {
  constructor(
    private db: Db,
    private tenantId: string,
    private fleetManager: IFleetManager,
    private entityRepo: IEntityRepository,
    private getGithubToken: () => Promise<string | null>,
  ) {}

  async emit(event: EngineEvent): Promise<void> {
    switch (event.type) {
      case "invocation.created":
        await this.onInvocationCreated(event);
        break;
      case "entity.transitioned":
        // Teardown on EVERY transition — not just terminal.
        // The next state's invocation.created will provision a fresh container.
        await this.teardownForEntity(event.entityId);
        break;
    }
  }

  private async onInvocationCreated(event: EngineEvent & { type: "invocation.created" }): Promise<void> {
    const entityId = event.entityId;

    // Skip passive invocations — they don't need a container
    if ("mode" in event && event.mode === "passive") return;

    // Check if a container already exists for this entity
    const existing = await this.db
      .select()
      .from(holyshipperContainers)
      .where(
        and(
          eq(holyshipperContainers.entityId, entityId),
          eq(holyshipperContainers.tenantId, this.tenantId),
          eq(holyshipperContainers.status, "running"),
        ),
      );
    if (existing.length > 0) return;

    // Build provision config from entity artifacts/refs
    const entity = await this.entityRepo.get(entityId);
    if (!entity) {
      logger.error("[lifecycle] entity not found for provisioning", { entityId });
      return;
    }

    const repoFullName = (entity.artifacts?.repoFullName as string) ?? "";
    const [owner = "", repo = ""] = repoFullName.includes("/") ? repoFullName.split("/") : ["", ""];
    const issueNumber = Number(entity.artifacts?.issueNumber) || 0;
    const flowName = entity.flowId ?? "";

    let githubToken = "";
    try {
      githubToken = (await this.getGithubToken()) ?? "";
    } catch (err) {
      logger.warn("[lifecycle] failed to get GitHub token", { error: String(err) });
    }

    const provisionConfig: ProvisionConfig = {
      entityId,
      flowName,
      owner,
      repo,
      issueNumber,
      githubToken,
    };

    // Create a pending record
    const id = crypto.randomUUID();
    await this.db.insert(holyshipperContainers).values({
      id,
      tenantId: this.tenantId,
      entityId,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Provision the container
    try {
      const { containerId, runnerUrl } = await this.fleetManager.provision(entityId, provisionConfig);

      logger.info("[lifecycle] container provisioned", {
        entityId,
        containerId,
        runnerUrl,
        owner,
        repo,
        issueNumber,
      });

      await this.db
        .update(holyshipperContainers)
        .set({
          containerId,
          runnerUrl,
          status: "running",
          provisionedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(holyshipperContainers.id, id));
    } catch (err) {
      logger.error("[lifecycle] container provision failed", {
        entityId,
        error: err instanceof Error ? err.message : String(err),
      });
      await this.db
        .update(holyshipperContainers)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(holyshipperContainers.id, id));
    }
  }

  private async teardownForEntity(entityId: string): Promise<void> {
    const containers = await this.db
      .select()
      .from(holyshipperContainers)
      .where(
        and(
          eq(holyshipperContainers.entityId, entityId),
          eq(holyshipperContainers.tenantId, this.tenantId),
          eq(holyshipperContainers.status, "running"),
        ),
      );

    for (const container of containers) {
      if (container.containerId) {
        try {
          await this.fleetManager.teardown(container.containerId);
          logger.info("[lifecycle] container torn down", {
            entityId,
            containerId: container.containerId,
          });
        } catch (err) {
          logger.warn("[lifecycle] container teardown failed (best effort)", {
            entityId,
            containerId: container.containerId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      await this.db
        .update(holyshipperContainers)
        .set({ status: "torn_down", tornDownAt: new Date(), updatedAt: new Date() })
        .where(eq(holyshipperContainers.id, container.id));
    }
  }
}
