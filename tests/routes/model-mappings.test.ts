import { describe, it, expect } from 'vitest';
import { withFreshDb } from '../helpers/db.js';
import { makeUpstream } from '../helpers/factories.js';
import modelMappingsApp from '../../src/routes/model-mappings.js';

describe('model-mappings routes', () => {
  it('POST / with full body returns 201', async () => {
    await withFreshDb(async (db) => {
      const upstream = await makeUpstream(db, { name: 'synthetic', baseUrl: 'https://api.synthetic.new' });
      const res = await modelMappingsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abstractName: 'kimi-k2.5',
          upstreamId: upstream.id,
          modelPath: 'kimi-k2.5-202501',
          priority: 2,
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('abstractName', 'kimi-k2.5');
      expect(body).toHaveProperty('upstreamId', upstream.id);
      expect(body).toHaveProperty('upstreamName', 'synthetic');
      expect(body).toHaveProperty('modelPath', 'kimi-k2.5-202501');
      expect(body).toHaveProperty('priority', 2);
    });
  });

  it('POST / invalid abstractName returns 400', async () => {
    await withFreshDb(async (db) => {
      const upstream = await makeUpstream(db, { name: 'synthetic', baseUrl: 'https://api.synthetic.new' });
      const res = await modelMappingsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abstractName: 'has spaces',
          upstreamId: upstream.id,
          modelPath: 'x',
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('GET / returns array', async () => {
    await withFreshDb(async (db) => {
      const upstream = await makeUpstream(db, { name: 'a', baseUrl: 'http://a' });
      await modelMappingsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abstractName: 'x', upstreamId: upstream.id, modelPath: 'y' }),
      });

      const res = await modelMappingsApp.request('/');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('DELETE /:id works; DELETE missing returns 404', async () => {
    await withFreshDb(async (db) => {
      const upstream = await makeUpstream(db, { name: 'a', baseUrl: 'http://a' });
      const createRes = await modelMappingsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abstractName: 'delme', upstreamId: upstream.id, modelPath: 'y' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();

      const delRes = await modelMappingsApp.request(`/${created.id}`, { method: 'DELETE' });
      expect(delRes.status).toBe(204);

      const del2 = await modelMappingsApp.request(`/${created.id}`, { method: 'DELETE' });
      expect(del2.status).toBe(404);
      const body = await del2.json();
      expect(body.error).toHaveProperty('type', 'not_found_error');
    });
  });

  describe('PATCH /:id', () => {
    it('updates an existing mapping', async () => {
      await withFreshDb(async (db) => {
        const a = await makeUpstream(db, { name: 'a', baseUrl: 'http://a' });
        const b = await makeUpstream(db, { name: 'b', baseUrl: 'http://b' });
        const createRes = await modelMappingsApp.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ abstractName: 'alpha', upstreamId: a.id, modelPath: 'm1', priority: 1 }),
        });
        expect(createRes.status).toBe(201);
        const created = await createRes.json();

        const patchRes = await modelMappingsApp.request(`/${created.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ abstractName: 'beta', upstreamId: b.id, modelPath: 'm2', priority: 2 }),
        });
        expect(patchRes.status).toBe(200);
        const body = await patchRes.json();
        expect(body.abstractName).toBe('beta');
        expect(body.upstreamId).toBe(b.id);
        expect(body.modelPath).toBe('m2');
        expect(body.priority).toBe(2);
        expect(body.upstreamName).toBe('b');
      });
    });

    it('allows partial updates', async () => {
      await withFreshDb(async (db) => {
        const a = await makeUpstream(db, { name: 'a', baseUrl: 'http://a' });
        const createRes = await modelMappingsApp.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ abstractName: 'alpha', upstreamId: a.id, modelPath: 'm1', priority: 1 }),
        });
        const created = await createRes.json();

        const patchRes = await modelMappingsApp.request(`/${created.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelPath: 'm2' }),
        });
        expect(patchRes.status).toBe(200);
        const body = await patchRes.json();
        expect(body.abstractName).toBe('alpha');
        expect(body.modelPath).toBe('m2');
        expect(body.priority).toBe(1);
        expect(body.upstreamName).toBe('a');

        // verify persistence via GET /
        const listRes = await modelMappingsApp.request('/');
        const list = await listRes.json();
        const found = list.find((m: any) => m.id === created.id);
        expect(found.modelPath).toBe('m2');
      });
    });

    it('returns 404 for unknown id', async () => {
      await withFreshDb(async () => {
        const res = await modelMappingsApp.request('/non-existent-id', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelPath: 'x' }),
        });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toHaveProperty('type', 'not_found_error');
      });
    });

    it('returns 404 for non-existent upstreamId', async () => {
      await withFreshDb(async (db) => {
        const a = await makeUpstream(db, { name: 'a', baseUrl: 'http://a' });
        const createRes = await modelMappingsApp.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ abstractName: 'alpha', upstreamId: a.id, modelPath: 'm1' }),
        });
        const created = await createRes.json();

        const patchRes = await modelMappingsApp.request(`/${created.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upstreamId: 'non-existent-id' }),
        });
        expect(patchRes.status).toBe(404);
        const body = await patchRes.json();
        expect(body.error).toHaveProperty('type', 'not_found_error');
      });
    });

    it('returns 400 for invalid abstractName', async () => {
      await withFreshDb(async (db) => {
        const a = await makeUpstream(db, { name: 'a', baseUrl: 'http://a' });
        const createRes = await modelMappingsApp.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ abstractName: 'alpha', upstreamId: a.id, modelPath: 'm1' }),
        });
        const created = await createRes.json();

        const patchRes = await modelMappingsApp.request(`/${created.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ abstractName: 'has spaces' }),
        });
        expect(patchRes.status).toBe(400);
        const body = await patchRes.json();
        expect(body.error).toHaveProperty('type', 'invalid_request_error');
      });
    });

    it('allows empty patch body (no-op)', async () => {
      await withFreshDb(async (db) => {
        const a = await makeUpstream(db, { name: 'a', baseUrl: 'http://a' });
        const createRes = await modelMappingsApp.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ abstractName: 'alpha', upstreamId: a.id, modelPath: 'm1', priority: 1 }),
        });
        const created = await createRes.json();

        const patchRes = await modelMappingsApp.request(`/${created.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(patchRes.status).toBe(200);
        const body = await patchRes.json();
        expect(body.abstractName).toBe('alpha');
        expect(body.modelPath).toBe('m1');
        expect(body.priority).toBe(1);
        expect(body.upstreamName).toBe('a');
      });
    });
  });
});
