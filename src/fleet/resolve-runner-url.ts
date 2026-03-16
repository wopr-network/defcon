/**
 * Resolve the runner URL for a given entity by querying the holyshipper_containers table.
 * Returns the URL of the running container, or null if none is available.
 */

import { and, eq } from "drizzle-orm";
import { holyshipperContainers } from "../repositories/drizzle/schema.js";

// biome-ignore lint/suspicious/noExplicitAny: cross-driver compat
type Db = any;

export function createResolveRunnerUrl(db: Db, tenantId: string) {
  return async (entityId: string): Promise<string | null> => {
    const rows = await db
      .select({ runnerUrl: holyshipperContainers.runnerUrl })
      .from(holyshipperContainers)
      .where(
        and(
          eq(holyshipperContainers.entityId, entityId),
          eq(holyshipperContainers.tenantId, tenantId),
          eq(holyshipperContainers.status, "running"),
        ),
      )
      .limit(1);

    return rows[0]?.runnerUrl ?? null;
  };
}
