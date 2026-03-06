import { randomUUID } from "node:crypto";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { IIntegrationRepository, IntegrationConfig } from "../interfaces.js";
import type * as schema from "./schema.js";
import { integrationConfig } from "./schema.js";

type Db = BetterSQLite3Database<typeof schema>;

export class DrizzleIntegrationRepository implements IIntegrationRepository {
  constructor(private readonly db: Db) {}

  async set(capability: string, adapter: string, config?: Record<string, unknown>): Promise<IntegrationConfig> {
    const id = randomUUID();
    const configValue = (config ?? null) as Record<string, unknown> | null;
    this.db
      .insert(integrationConfig)
      .values({ id, capability, adapter, config: configValue })
      .onConflictDoUpdate({
        target: integrationConfig.capability,
        set: { adapter, config: configValue },
      })
      .run();
    return { id, capability, adapter, config: configValue };
  }
}
