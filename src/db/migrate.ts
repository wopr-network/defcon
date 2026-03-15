/**
 * Run database migrations:
 * 1. Platform-core migrations (auth, billing, credits tables)
 * 2. Holyship engine migrations (entities, flows, gates tables)
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import * as schema from "@wopr-network/platform-core/db/schema/index";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";

const require = createRequire(import.meta.url);

export async function runMigrations(pool: pg.Pool): Promise<void> {
  const db = drizzle(pool, { schema });

  // 1. Platform-core migrations (from npm package)
  const coreMain = require.resolve("@wopr-network/platform-core");
  const coreRoot = path.resolve(path.dirname(coreMain), "..");
  const coreMigrations = path.resolve(coreRoot, "drizzle/migrations");
  await migrate(db, { migrationsFolder: coreMigrations });

  // 2. Holyship engine migrations (local drizzle/ directory)
  const localMigrations = path.resolve(process.cwd(), "drizzle");
  if (existsSync(localMigrations)) {
    await migrate(db, { migrationsFolder: localMigrations });
  }
}
