import { describe, it, expect } from 'vitest';
import { withFreshDb } from '../helpers/db.js';
import upstreamsApp from '../../src/routes/upstreams.js';

describe('upstreams routes', () => {
  it('POST / with full body returns 201, body has masked apiKey', async () => {
    await withFreshDb(async () => {
      const res = await upstreamsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-secret123',
          headers: { 'X-Custom': 'val' },
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'openai');
      expect(body).toHaveProperty('baseUrl', 'https://api.openai.com/v1');
      expect(body).toHaveProperty('apiKeyMasked');
      expect(body.apiKeyMasked).toContain('...');
      expect(body).toHaveProperty('headers');
    });
  });

  it('POST / duplicate name returns 409', async () => {
    await withFreshDb(async () => {
      const first = await upstreamsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'dup', baseUrl: 'https://example.com' }),
      });
      expect(first.status).toBe(201);

      const second = await upstreamsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'dup', baseUrl: 'https://example.com' }),
      });
      expect(second.status).toBe(409);
      const body = await second.json();
      expect(body.error).toHaveProperty('type', 'conflict_error');
    });
  });

  it('POST / invalid name (with spaces) returns 400', async () => {
    await withFreshDb(async () => {
      const res = await upstreamsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'has spaces', baseUrl: 'https://example.com' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('POST / missing baseUrl returns 400', async () => {
    await withFreshDb(async () => {
      const res = await upstreamsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'validname' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('GET / returns array', async () => {
    await withFreshDb(async () => {
      await upstreamsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'up1', baseUrl: 'https://a.com' }),
      });

      const res = await upstreamsApp.request('/');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('DELETE /:id works; DELETE missing returns 404', async () => {
    await withFreshDb(async () => {
      const createRes = await upstreamsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'delme', baseUrl: 'https://del.me' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();

      const delRes = await upstreamsApp.request(`/${created.id}`, { method: 'DELETE' });
      expect(delRes.status).toBe(204);

      const del2 = await upstreamsApp.request(`/${created.id}`, { method: 'DELETE' });
      expect(del2.status).toBe(404);
      const body = await del2.json();
      expect(body.error).toHaveProperty('type');
    });
  });
});
