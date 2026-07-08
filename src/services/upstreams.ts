import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { upstreams, type UpstreamSelect, type UpstreamInsert } from '../db/schema.js';
import { HttpError } from '../lib/errors.js';
import { maskApiKey } from '../lib/api-key.js';
import type { UpstreamResponse } from '../types/api.js';

const CHATGPT_CODEX_BASE_URL_SENTINEL = 'chatgpt-codex://local';

export type CreateUpstreamInput = {
  name: string;
  type?: 'openai-compatible' | 'chatgpt-codex';
  baseUrl: string | null | undefined;
  apiKey: string | null | undefined;
  headers: Record<string, string> | null | undefined;
};

export function createUpstream(input: CreateUpstreamInput): UpstreamResponse {
  const db = getDb();
  const now = new Date();

  const insert: UpstreamInsert = {
    id: randomUUID(),
    name: input.name,
    type: input.type ?? 'openai-compatible',
    baseUrl: input.type === 'chatgpt-codex' ? CHATGPT_CODEX_BASE_URL_SENTINEL : input.baseUrl ?? '',
    apiKey: input.type === 'chatgpt-codex' ? null : input.apiKey ?? null,
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

export function updateUpstreamName(id: string, newName: string): UpstreamResponse {
  const db = getDb();
  const existing = db.select().from(upstreams).where(eq(upstreams.id, id)).get();
  if (!existing) {
    throw new HttpError({
      message: 'Upstream not found',
      status: 404,
      type: 'not_found_error',
    });
  }

  try {
    db.update(upstreams)
      .set({ name: newName })
      .where(eq(upstreams.id, id))
      .run();
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

  return toUpstreamResponse({ ...existing, name: newName });
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

export function findUpstreamById(id: string): RawUpstream | null {
  const db = getDb();
  const row = db.select().from(upstreams).where(eq(upstreams.id, id)).get();
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
    type: row.type ?? 'openai-compatible',
    baseUrl: row.type === 'chatgpt-codex' ? null : row.baseUrl,
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
