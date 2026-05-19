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
});
