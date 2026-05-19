import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { freshDb, schema } from '../helpers/db.js';
import { makeUpstream } from '../helpers/factories.js';
import {
  createUpstream,
  listUpstreams,
  deleteUpstream,
  findUpstreamByName,
  findUpstreamById,
  updateUpstreamName,
} from '../../src/services/upstreams.js';
import { HttpError } from '../../src/lib/errors.js';

let dbCtx: ReturnType<typeof freshDb>;

describe('upstreams service', () => {
  beforeEach(() => {
    dbCtx = freshDb();
  });

  afterEach(() => {
    dbCtx.cleanup();
  });

  describe('createUpstream', () => {
    it('persists and returns UpstreamResponse with masked apiKey', () => {
      const resp = createUpstream({
        name: 'openai',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-1234567890abcdef',
        headers: { 'X-Custom': 'value' },
      });
      expect(resp.name).toBe('openai');
      expect(resp.baseUrl).toBe('https://api.openai.com');
      expect(resp.apiKeyMasked).toBe('sk-...cdef');
      expect(resp.headers).toEqual({ 'X-Custom': 'value' });
    });

    it('throws HttpError(409) for duplicate name', () => {
      createUpstream({ name: 'ollama', baseUrl: 'http://localhost:11434' });
      expect(() =>
        createUpstream({ name: 'ollama', baseUrl: 'http://other:11434' })
      ).toThrow(HttpError);
      try {
        createUpstream({ name: 'ollama', baseUrl: 'http://other:11434' });
      } catch (err) {
        expect((err as HttpError).status).toBe(409);
      }
    });
  });

  describe('listUpstreams', () => {
    it('returns rows in createdAt order with masked keys and parsed headers', async () => {
      const u1 = await makeUpstream(dbCtx.db, { name: 'alpha', baseUrl: 'http://a', createdAt: new Date('2024-01-01'), headers: JSON.stringify({ h1: 'v1' }) });
      const u2 = await makeUpstream(dbCtx.db, { name: 'beta', baseUrl: 'http://b', createdAt: new Date('2024-01-02') });

      const list = listUpstreams();
      expect(list.length).toBe(2);
      expect(list[0].id).toBe(u1.id);
      expect(list[1].id).toBe(u2.id);
      expect(list[0].apiKeyMasked).toBeNull();
      expect(list[0].headers).toEqual({ h1: 'v1' });
      expect(list[1].headers).toBeNull();
    });
  });

  describe('deleteUpstream', () => {
    it('removes the row', async () => {
      const u = await makeUpstream(dbCtx.db, { name: 'to-delete', baseUrl: 'http://x' });
      deleteUpstream(u.id);
      const rows = await dbCtx.db.select().from(schema.upstreams).where(eq(schema.upstreams.id, u.id));
      expect(rows.length).toBe(0);
    });

    it('throws 404 for unknown id', () => {
      expect(() => deleteUpstream('non-existent-id')).toThrow(HttpError);
      try {
        deleteUpstream('non-existent-id');
      } catch (err) {
        expect((err as HttpError).status).toBe(404);
      }
    });
  });

  describe('findUpstreamByName', () => {
    it('returns the raw row including unmasked apiKey and parsed headers', async () => {
      await makeUpstream(dbCtx.db, {
        name: 'ollama',
        baseUrl: 'http://localhost:11434',
        apiKey: 'secret-key',
        headers: JSON.stringify({ h1: 'v1' }),
      });
      const found = findUpstreamByName('ollama');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('ollama');
      expect(found!.apiKey).toBe('secret-key');
      expect(found!.headers).toEqual({ h1: 'v1' });
    });

    it('returns null for missing name', () => {
      const found = findUpstreamByName('missing');
      expect(found).toBeNull();
    });
  });

  describe('findUpstreamById', () => {
    it('returns the raw row by id', async () => {
      const u = await makeUpstream(dbCtx.db, {
        name: 'ollama',
        baseUrl: 'http://localhost:11434',
        apiKey: 'secret-key',
      });
      const found = findUpstreamById(u.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(u.id);
      expect(found!.name).toBe('ollama');
      expect(found!.apiKey).toBe('secret-key');
    });

    it('returns null for missing id', () => {
      const found = findUpstreamById('missing');
      expect(found).toBeNull();
    });
  });

  describe('updateUpstreamName', () => {
    it('updates the name and returns the response', async () => {
      const u = await makeUpstream(dbCtx.db, { name: 'old-name', baseUrl: 'http://x' });
      const resp = updateUpstreamName(u.id, 'new-name');
      expect(resp.name).toBe('new-name');
      expect(resp.id).toBe(u.id);

      const rows = await dbCtx.db.select().from(schema.upstreams).where(eq(schema.upstreams.id, u.id));
      expect(rows[0].name).toBe('new-name');
    });

    it('throws HttpError(404) for unknown id', () => {
      expect(() => updateUpstreamName('non-existent-id', 'whatever')).toThrow(HttpError);
      try {
        updateUpstreamName('non-existent-id', 'whatever');
      } catch (err) {
        expect((err as HttpError).status).toBe(404);
      }
    });

    it('throws HttpError(409) for duplicate name', async () => {
      await makeUpstream(dbCtx.db, { name: 'existing', baseUrl: 'http://a' });
      const u = await makeUpstream(dbCtx.db, { name: 'original', baseUrl: 'http://b' });
      expect(() => updateUpstreamName(u.id, 'existing')).toThrow(HttpError);
      try {
        updateUpstreamName(u.id, 'existing');
      } catch (err) {
        expect((err as HttpError).status).toBe(409);
      }
    });
  });
});
