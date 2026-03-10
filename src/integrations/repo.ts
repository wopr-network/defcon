import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { integrations } from "../repositories/drizzle/schema.js";
import { encryptCredentials } from "./encrypt.js";
import type { IntegrationCategory, IntegrationCredentials, IntegrationProvider } from "./types.js";

export interface IntegrationRow {
  id: string;
  tenantId: string;
  name: string;
  category: IntegrationCategory;
  provider: IntegrationProvider;
  /** AES-256-GCM encrypted credential blob. */
  encryptedCredentials: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIntegrationParams {
  name: string;
  category: IntegrationCategory;
  provider: IntegrationProvider;
  credentials: IntegrationCredentials;
}

export interface IIntegrationRepository {
  create(params: CreateIntegrationParams): Promise<IntegrationRow>;
  getById(id: string): Promise<IntegrationRow | null>;
  getByName(name: string): Promise<IntegrationRow | null>;
  listByCategory(category: IntegrationCategory): Promise<IntegrationRow[]>;
  list(): Promise<IntegrationRow[]>;
  updateCredentials(id: string, credentials: IntegrationCredentials): Promise<IntegrationRow>;
  delete(id: string): Promise<void>;
}

export class DrizzleIntegrationRepository implements IIntegrationRepository {
  constructor(
    // biome-ignore lint/suspicious/noExplicitAny: cross-driver compat (postgres-js + PGlite)
    private readonly db: any,
    private readonly tenantId: string,
  ) {}

  async create(params: CreateIntegrationParams): Promise<IntegrationRow> {
    const id = randomUUID();
    const now = new Date();
    const encrypted = encryptCredentials(params.credentials);
    const [row] = await this.db
      .insert(integrations)
      .values({
        id,
        tenantId: this.tenantId,
        name: params.name,
        category: params.category,
        provider: params.provider,
        credentials: encrypted,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return toRow(row);
  }

  async getById(id: string): Promise<IntegrationRow | null> {
    const [row] = await this.db
      .select()
      .from(integrations)
      .where(and(eq(integrations.id, id), eq(integrations.tenantId, this.tenantId)));
    return row ? toRow(row) : null;
  }

  async getByName(name: string): Promise<IntegrationRow | null> {
    const [row] = await this.db
      .select()
      .from(integrations)
      .where(and(eq(integrations.name, name), eq(integrations.tenantId, this.tenantId)));
    return row ? toRow(row) : null;
  }

  async listByCategory(category: IntegrationCategory): Promise<IntegrationRow[]> {
    const rows = await this.db
      .select()
      .from(integrations)
      .where(and(eq(integrations.tenantId, this.tenantId), eq(integrations.category, category)));
    return rows.map(toRow);
  }

  async list(): Promise<IntegrationRow[]> {
    const rows = await this.db.select().from(integrations).where(eq(integrations.tenantId, this.tenantId));
    return rows.map(toRow);
  }

  async updateCredentials(id: string, credentials: IntegrationCredentials): Promise<IntegrationRow> {
    const encrypted = encryptCredentials(credentials);
    const [row] = await this.db
      .update(integrations)
      .set({ credentials: encrypted, updatedAt: new Date() })
      .where(and(eq(integrations.id, id), eq(integrations.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new Error(`Integration not found: ${id}`);
    return toRow(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(integrations).where(and(eq(integrations.id, id), eq(integrations.tenantId, this.tenantId)));
  }
}

function toRow(raw: typeof integrations.$inferSelect): IntegrationRow {
  return {
    id: raw.id,
    tenantId: raw.tenantId,
    name: raw.name,
    category: raw.category as IntegrationCategory,
    provider: raw.provider as IntegrationProvider,
    encryptedCredentials: raw.credentials,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
