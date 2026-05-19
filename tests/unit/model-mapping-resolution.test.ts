import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, schema } from '../helpers/db.js';
import { makeUpstream, makeModelMapping } from '../helpers/factories.js';
import {
  resolveModelMapping,
} from '../../src/services/model-mappings.js';
import { eq } from 'drizzle-orm';

let dbCtx: ReturnType<typeof freshDb>;

describe('model mapping resolution', () => {
  beforeEach(() => {
    dbCtx = freshDb();
  });

  afterEach(() => {
    dbCtx.cleanup();
  });

  it('resolves to the highest-priority mapping', async () => {
    const s = await makeUpstream(dbCtx.db, { name: 'synthetic', baseUrl: 'https://api.synthetic.new' });
    const o = await makeUpstream(dbCtx.db, { name: 'openrouter', baseUrl: 'https://openrouter.ai' });

    await makeModelMapping(dbCtx.db, {
      abstractName: 'kimi-k2.5',
      upstreamId: o.id,
      modelPath: 'moonshotai/kimi-k2.5',
      priority: 2,
    });
    await makeModelMapping(dbCtx.db, {
      abstractName: 'kimi-k2.5',
      upstreamId: s.id,
      modelPath: 'kimi-k2.5-202501',
      priority: 1,
    });

    const resolved = resolveModelMapping('kimi-k2.5');
    expect(resolved).not.toBeNull();
    expect(resolved!.upstreamId).toBe(s.id);
    expect(resolved!.modelPath).toBe('kimi-k2.5-202501');
  });

  it('returns null when no mapping exists', () => {
    const resolved = resolveModelMapping('missing-model');
    expect(resolved).toBeNull();
  });
});
