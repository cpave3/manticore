import { randomUUID } from 'node:crypto';
import { eq, asc } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { modelMappings, upstreams, type ModelMappingSelect, type ModelMappingInsert } from '../db/schema.js';
import { findUpstreamById } from './upstreams.js';
import { HttpError } from '../lib/errors.js';
import type { ModelMappingResponse } from '../types/api.js';

export type CreateMappingInput = {
  abstractName: string;
  upstreamId: string;
  modelPath: string;
  priority?: number;
};

export function createMapping(input: CreateMappingInput): ModelMappingResponse {
  const db = getDb();

  // Validate upstream exists
  const upstream = findUpstreamById(input.upstreamId);
  if (!upstream) {
    throw new HttpError({
      message: `Upstream not found: ${input.upstreamId}`,
      status: 404,
      type: 'not_found_error',
    });
  }

  const now = new Date();
  const insert: ModelMappingInsert = {
    id: randomUUID(),
    abstractName: input.abstractName,
    upstreamId: input.upstreamId,
    modelPath: input.modelPath,
    priority: input.priority ?? 1,
    createdAt: now,
  };

  db.insert(modelMappings).values(insert).run();

  return toModelMappingResponse(insert, upstream.name);
}

export function listMappings(): ModelMappingResponse[] {
  const db = getDb();
  const rows = db
    .select({
      id: modelMappings.id,
      abstractName: modelMappings.abstractName,
      upstreamId: modelMappings.upstreamId,
      upstreamName: upstreams.name,
      modelPath: modelMappings.modelPath,
      priority: modelMappings.priority,
      createdAt: modelMappings.createdAt,
    })
    .from(modelMappings)
    .leftJoin(upstreams, eq(modelMappings.upstreamId, upstreams.id))
    .orderBy(modelMappings.abstractName, asc(modelMappings.priority))
    .all();
  return rows.map((r) => ({
    id: r.id,
    abstractName: r.abstractName,
    upstreamId: r.upstreamId,
    upstreamName: r.upstreamName ?? '—',
    modelPath: r.modelPath,
    priority: r.priority ?? 1,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));
}

export function deleteMapping(id: string): void {
  const db = getDb();
  const result = db.delete(modelMappings).where(eq(modelMappings.id, id)).run();
  if (result.changes === 0) {
    throw new HttpError({
      message: 'Model mapping not found',
      status: 404,
      type: 'not_found_error',
    });
  }
}

export type UpdateMappingInput = {
  abstractName?: string;
  upstreamId?: string;
  modelPath?: string;
  priority?: number;
};

export function updateMapping(id: string, input: UpdateMappingInput): ModelMappingResponse {
  const db = getDb();
  const existing = db.select().from(modelMappings).where(eq(modelMappings.id, id)).get();
  if (!existing) {
    throw new HttpError({
      message: 'Model mapping not found',
      status: 404,
      type: 'not_found_error',
    });
  }

  // Validate upstream if changing
  if (input.upstreamId !== undefined) {
    const upstream = findUpstreamById(input.upstreamId);
    if (!upstream) {
      throw new HttpError({
        message: `Upstream not found: ${input.upstreamId}`,
        status: 404,
        type: 'not_found_error',
      });
    }
  }

  db.update(modelMappings)
    .set({
      abstractName: input.abstractName ?? existing.abstractName,
      upstreamId: input.upstreamId ?? existing.upstreamId,
      modelPath: input.modelPath ?? existing.modelPath,
      priority: input.priority ?? existing.priority,
    })
    .where(eq(modelMappings.id, id))
    .run();

  const finalUpstreamId = input.upstreamId ?? existing.upstreamId;
  const upstreamName = findUpstreamById(finalUpstreamId)?.name ?? '—';

  return toModelMappingResponse(
    {
      ...existing,
      abstractName: input.abstractName ?? existing.abstractName,
      upstreamId: finalUpstreamId,
      modelPath: input.modelPath ?? existing.modelPath,
      priority: input.priority ?? existing.priority,
    },
    upstreamName
  );
}

export function resolveModelMapping(
  abstractName: string
): { upstreamId: string; modelPath: string } | null {
  const db = getDb();
  const row = db
    .select()
    .from(modelMappings)
    .where(eq(modelMappings.abstractName, abstractName))
    .orderBy(asc(modelMappings.priority))
    .limit(1)
    .get();

  if (!row) return null;
  return { upstreamId: row.upstreamId, modelPath: row.modelPath };
}

function toModelMappingResponse(row: ModelMappingSelect | ModelMappingInsert, upstreamName?: string): ModelMappingResponse {
  return {
    id: row.id,
    abstractName: row.abstractName,
    upstreamId: row.upstreamId,
    upstreamName: upstreamName ?? '—',
    modelPath: row.modelPath,
    priority: row.priority ?? 1,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
