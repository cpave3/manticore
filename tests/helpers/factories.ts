import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export async function makeClient(
  db: Db,
  overrides: Partial<typeof schema.clients.$inferInsert> = {}
) {
  const id = overrides.id ?? randomUUID();
  const apiKey = `mc_${randomUUID().replace(/-/g, '')}`;
  const values = {
    name: 'Test Client',
    apiKey,
    createdAt: new Date(),
    ...overrides,
    id,
  };
  await db.insert(schema.clients).values(values);
  const [row] = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
  return row;
}

export async function makeUpstream(
  db: Db,
  overrides: Partial<typeof schema.upstreams.$inferInsert> = {}
) {
  const id = overrides.id ?? randomUUID();
  const values = {
    name: 'test-upstream',
    baseUrl: 'http://localhost:9999',
    createdAt: new Date(),
    ...overrides,
    id,
  };
  await db.insert(schema.upstreams).values(values);
  const [row] = await db.select().from(schema.upstreams).where(eq(schema.upstreams.id, id));
  return row;
}

export async function makeModelMapping(
  db: Db,
  overrides: Partial<typeof schema.modelMappings.$inferInsert> = {}
) {
  const id = overrides.id ?? randomUUID();
  const values = {
    abstractName: 'kimi-k2.5',
    upstreamName: 'synthetic',
    modelPath: 'kimi-k2.5-202501',
    priority: 1,
    createdAt: new Date(),
    ...overrides,
    id,
  };
  await db.insert(schema.modelMappings).values(values);
  const [row] = await db.select().from(schema.modelMappings).where(eq(schema.modelMappings.id, id));
  return row;
}

export async function makeLogRecord(
  db: Db,
  overrides: Partial<typeof schema.logRecords.$inferInsert> = {}
) {
  const id = overrides.id ?? randomUUID();
  const values = {
    clientId: randomUUID(),
    clientName: 'Test Client',
    modelId: 'openai/gpt-4o',
    latencyMs: 100,
    status: 'success' as const,
    createdAt: new Date(),
    ...overrides,
    id,
  };
  await db.insert(schema.logRecords).values(values);
  const [row] = await db.select().from(schema.logRecords).where(eq(schema.logRecords.id, id));
  return row;
}
