import { randomUUID } from 'node:crypto';
import { eq, and, asc } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { modelMappings, type ModelMappingSelect, type ModelMappingInsert } from '../db/schema.js';
import { findUpstreamByName } from './upstreams.js';
import { HttpError } from '../lib/errors.js';
import type { ModelMappingResponse } from '../types/api.js';

export type CreateMappingInput = {
  abstractName: string;
  upstreamName: string;
  modelPath: string;
  priority?: number;
};

export function createMapping(input: CreateMappingInput): ModelMappingResponse {
  const db = getDb();
  const now = new Date();

  const insert: ModelMappingInsert = {
    id: randomUUID(),
    abstractName: input.abstractName,
    upstreamName: input.upstreamName,
    modelPath: input.modelPath,
    priority: input.priority ?? 1,
    createdAt: now,
  };

  db.insert(modelMappings).values(insert).run();

  return toModelMappingResponse(insert);
}

export function listMappings(): ModelMappingResponse[] {
  const db = getDb();
  const rows = db
    .select()
    .from(modelMappings)
    .orderBy(modelMappings.abstractName, asc(modelMappings.priority))
    .all();
  return rows.map(toModelMappingResponse);
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

export function resolveModelMapping(
  abstractName: string
): { upstreamName: string; modelPath: string } | null {
  const db = getDb();
  const row = db
    .select()
    .from(modelMappings)
    .where(eq(modelMappings.abstractName, abstractName))
    .orderBy(asc(modelMappings.priority))
    .limit(1)
    .get();

  if (!row) return null;
  return { upstreamName: row.upstreamName, modelPath: row.modelPath };
}

function toModelMappingResponse(row: ModelMappingSelect | ModelMappingInsert): ModelMappingResponse {
  return {
    id: row.id,
    abstractName: row.abstractName,
    upstreamName: row.upstreamName,
    modelPath: row.modelPath,
    priority: row.priority ?? 1,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
