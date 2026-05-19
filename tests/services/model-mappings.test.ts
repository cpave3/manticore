import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb } from '../helpers/db.js';
import { makeUpstream } from '../helpers/factories.js';
import {
  createMapping,
  listMappings,
  deleteMapping,
} from '../../src/services/model-mappings.js';
import { HttpError } from '../../src/lib/errors.js';

let dbCtx: ReturnType<typeof freshDb>;

describe('model-mappings service', () => {
  beforeEach(() => {
    dbCtx = freshDb();
  });

  afterEach(() => {
    dbCtx.cleanup();
  });

  describe('createMapping', () => {
    it('persists and returns ModelMappingResponse with upstreamId + upstreamName', async () => {
      const upstream = await makeUpstream(dbCtx.db, { name: 'synthetic', baseUrl: 'https://api.synthetic.new' });
      const resp = createMapping({
        abstractName: 'kimi-k2.5',
        upstreamId: upstream.id,
        modelPath: 'kimi-k2.5-202501',
      });
      expect(resp.abstractName).toBe('kimi-k2.5');
      expect(resp.upstreamId).toBe(upstream.id);
      expect(resp.upstreamName).toBe('synthetic');
      expect(resp.modelPath).toBe('kimi-k2.5-202501');
      expect(resp.priority).toBe(1);
    });

    it('accepts custom priority', async () => {
      const upstream = await makeUpstream(dbCtx.db, { name: 'ollama', baseUrl: 'http://localhost:11434' });
      const resp = createMapping({
        abstractName: 'llama3',
        upstreamId: upstream.id,
        modelPath: 'llama3',
        priority: 5,
      });
      expect(resp.priority).toBe(5);
    });

    it('throws HttpError(404) for non-existent upstream id', async () => {
      expect(() =>
        createMapping({
          abstractName: 'x',
          upstreamId: 'non-existent-id',
          modelPath: 'y',
        })
      ).toThrow(HttpError);
      try {
        createMapping({
          abstractName: 'x',
          upstreamId: 'non-existent-id',
          modelPath: 'y',
        });
      } catch (err) {
        expect((err as HttpError).status).toBe(404);
      }
    });
  });

  describe('listMappings', () => {
    it('returns rows ordered by abstractName then priority', async () => {
      const a = await makeUpstream(dbCtx.db, { name: 'a', baseUrl: 'http://a' });
      const b = await makeUpstream(dbCtx.db, { name: 'b', baseUrl: 'http://b' });

      createMapping({ abstractName: 'zeta', upstreamId: a.id, modelPath: 'm1', priority: 2 });
      createMapping({ abstractName: 'alpha', upstreamId: b.id, modelPath: 'm2', priority: 1 });
      createMapping({ abstractName: 'alpha', upstreamId: a.id, modelPath: 'm3', priority: 2 });

      const list = listMappings();
      expect(list.map((r) => [r.abstractName, r.priority])).toEqual([
        ['alpha', 1],
        ['alpha', 2],
        ['zeta', 2],
      ]);
    });
  });

  describe('deleteMapping', () => {
    it('removes the row', async () => {
      const upstream = await makeUpstream(dbCtx.db, { name: 'a', baseUrl: 'http://a' });
      const created = createMapping({ abstractName: 'x', upstreamId: upstream.id, modelPath: 'y' });
      deleteMapping(created.id);
      expect(listMappings().length).toBe(0);
    });

    it('throws 404 for unknown id', () => {
      expect(() => deleteMapping('non-existent-id')).toThrow(HttpError);
      try {
        deleteMapping('non-existent-id');
      } catch (err) {
        expect((err as HttpError).status).toBe(404);
      }
    });
  });
});
