import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { DomainEvent, IDomainEventRepository } from "../interfaces.js";
import type * as schema from "./schema.js";
import { domainEvents } from "./schema.js";

type Db = BetterSQLite3Database<typeof schema>;

export class DrizzleDomainEventRepository implements IDomainEventRepository {
  constructor(private readonly db: Db) {}

  async append(type: string, entityId: string, payload: Record<string, unknown>): Promise<DomainEvent> {
    return this.db.transaction((tx) => {
      const maxRow = tx
        .select({ maxSeq: sql<number>`coalesce(max(${domainEvents.sequence}), 0)` })
        .from(domainEvents)
        .where(eq(domainEvents.entityId, entityId))
        .get();
      const sequence = (maxRow?.maxSeq ?? 0) + 1;
      const id = randomUUID();
      const emittedAt = Date.now();

      tx.insert(domainEvents).values({ id, type, entityId, payload, sequence, emittedAt }).run();

      return { id, type, entityId, payload, sequence, emittedAt };
    });
  }

  async list(entityId: string, opts?: { type?: string; limit?: number }): Promise<DomainEvent[]> {
    const conditions = [eq(domainEvents.entityId, entityId)];
    if (opts?.type) {
      conditions.push(eq(domainEvents.type, opts.type));
    }

    const rows = this.db
      .select()
      .from(domainEvents)
      .where(and(...conditions))
      .orderBy(domainEvents.sequence)
      .limit(opts?.limit ?? 100)
      .all();

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      entityId: r.entityId,
      payload: r.payload as Record<string, unknown>,
      sequence: r.sequence,
      emittedAt: r.emittedAt,
    }));
  }
}
