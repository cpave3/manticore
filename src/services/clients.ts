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
