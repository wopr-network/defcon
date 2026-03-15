/**
 * Database setup for holyship.
 *
 * Shared pg.Pool backing two Drizzle instances:
 * - platformDb: platform-core schema (auth, billing, credits, etc.)
 * - engineDb: holyship engine schema (entities, flows, gates, etc.)
 */

import { createDb as createPlatformDb, type PlatformDb } from "@wopr-network/platform-core/db";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { logger } from "../logger.js";
import * as engineSchema from "../repositories/drizzle/schema.js";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _platformDb: PlatformDb | null = null;
// biome-ignore lint/suspicious/noExplicitAny: drizzle generic is unwieldy
let _engineDb: any = null;

export function getPool(): pg.Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL not set — cannot initialize database");
    }
    _pool = new Pool({ connectionString: url });
    _pool.on("error", (err: Error) => {
      logger.error("Postgres pool error", err.message);
    });
  }
  return _pool;
}

/** Platform-core drizzle instance (auth, billing, credits, orgs, etc.) */
export function getPlatformDb(): PlatformDb {
  if (!_platformDb) {
    _platformDb = createPlatformDb(getPool());
  }
  return _platformDb;
}

/** Engine drizzle instance (entities, flows, gates, invocations, etc.) */
export function getEngineDb() {
  if (!_engineDb) {
    _engineDb = drizzle(getPool(), { schema: engineSchema });
  }
  return _engineDb;
}

export function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL;
}
