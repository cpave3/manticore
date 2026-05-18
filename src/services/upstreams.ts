import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { upstreams, type UpstreamSelect, type UpstreamInsert } from '../db/schema.js';
import { HttpError } from '../lib/errors.js';
import { maskApiKey } from '../lib/api-key.js';
import type { UpstreamResponse } from '../types/api.js';

export type CreateUpstreamInput = {
  name: string;
  baseUrl: string;
  apiKey: string | null | undefined;
  headers: Record<string, string> | null | undefined;
};

export function createUpstream(input: CreateUpstreamInput): UpstreamResponse {
  const db = getDb();
  const now = new Date();

  const insert: UpstreamInsert = {
    id: randomUUID(),
    name: input.name,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey ?? null,
    headers: input.headers ? JSON.stringify(input.headers) : null,
    createdAt: now,
  };

  try {
    db.insert(upstreams).values(insert).run();
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      throw new HttpError({
        message: 'Upstream name already exists',
        status: 409,
        type: 'conflict_error',
      });
    }
    throw err;
  }

  return toUpstreamResponse(insert);
}

export function listUpstreams(): UpstreamResponse[] {
  const db = getDb();
  const rows = db.select().from(upstreams).orderBy(upstreams.createdAt).all();
  return rows.map(toUpstreamResponse);
}

export function deleteUpstream(id: string): void {
  const db = getDb();
  const result = db.delete(upstreams).where(eq(upstreams.id, id)).run();
  if (result.changes === 0) {
    throw new HttpError({
      message: `Upstream not found`,
      status: 404,
      type: 'not_found_error',
    });
  }
}

export type RawUpstream = Omit<UpstreamSelect, 'headers'> & {
  headers: Record<string, string> | null;
};

export function findUpstreamByName(name: string): RawUpstream | null {
  const db = getDb();
  const row = db.select().from(upstreams).where(eq(upstreams.name, name)).get();
  if (!row) return null;
  return {
    ...row,
    headers: row.headers ? (JSON.parse(row.headers) as Record<string, string>) : null,
  };
}

function toUpstreamResponse(row: UpstreamSelect | UpstreamInsert): UpstreamResponse {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKeyMasked: row.apiKey ? maskApiKey(row.apiKey) : null,
    headers: row.headers ? (JSON.parse(row.headers) as Record<string, string>) : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

function isUniqueConstraintError(err: unknown): boolean {
  if (err instanceof Error) {
    return /unique constraint|UNIQUE constraint/i.test(err.message);
  }
  return false;
}
