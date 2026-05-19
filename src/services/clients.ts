import { eq, isNull, and } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { clients } from '../db/schema.js';
import { generateApiKey, maskApiKey, apiKeyPrefix } from '../lib/api-key.js';
import { HttpError } from '../lib/errors.js';
import type { ClientResponse } from '../types/api.js';

function rowToResponse(row: typeof clients.$inferSelect): ClientResponse {
  return {
    id: row.id,
    name: row.name,
    apiKeyPrefix: apiKeyPrefix(row.apiKey),
    apiKeyMasked: maskApiKey(row.apiKey),
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

export async function createClient(name: string): Promise<{ client: ClientResponse; apiKey: string }> {
  const db = getDb();
  const id = crypto.randomUUID();
  const apiKey = generateApiKey();
  const now = new Date();

  await db.insert(clients).values({
    id,
    name,
    apiKey,
    createdAt: now,
  });

  const row = await db.select().from(clients).where(eq(clients.id, id)).get();
  if (!row) {
    throw new Error('Failed to retrieve created client');
  }

  return {
    client: rowToResponse(row),
    apiKey,
  };
}

export async function listClients(): Promise<ClientResponse[]> {
  const db = getDb();
  const rows = await db.select().from(clients).orderBy(clients.createdAt).all();
  return rows.map(rowToResponse);
}

export async function updateClientName(id: string, newName: string): Promise<ClientResponse> {
  const db = getDb();
  const existing = await db.select().from(clients).where(eq(clients.id, id)).get();
  if (!existing) {
    throw new HttpError({
      message: 'Client not found',
      status: 404,
      type: 'not_found_error',
    });
  }

  const duplicate = await db
    .select()
    .from(clients)
    .where(and(eq(clients.name, newName), isNull(clients.deletedAt)))
    .get();
  if (duplicate && duplicate.id !== id) {
    throw new HttpError({
      message: 'Client name already exists',
      status: 409,
      type: 'conflict_error',
    });
  }

  await db.update(clients).set({ name: newName }).where(eq(clients.id, id));

  return rowToResponse({ ...existing, name: newName });
}

export async function deleteClient(id: string): Promise<void> {
  const db = getDb();
  const row = await db.select().from(clients).where(eq(clients.id, id)).get();
  if (!row) {
    throw new HttpError({
      message: 'Client not found',
      status: 404,
      type: 'invalid_request_error',
    });
  }

  await db
    .update(clients)
    .set({ deletedAt: new Date() })
    .where(eq(clients.id, id));
}

export async function findClientByApiKey(apiKey: string): Promise<{ id: string; name: string } | null> {
  const db = getDb();
  const row = await db
    .select()
    .from(clients)
    .where(and(eq(clients.apiKey, apiKey), isNull(clients.deletedAt)))
    .get();

  if (!row) return null;

  return { id: row.id, name: row.name };
}
