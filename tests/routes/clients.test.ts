import { describe, it, expect } from 'vitest';
import { withFreshDb } from '../helpers/db.js';
import { makeClient } from '../helpers/factories.js';
import clientsApp from '../../src/routes/clients.js';
import { getDb } from '../../src/db/client.js';

describe('clients routes', () => {
  it('POST / creates a client and returns 201 with id, name, apiKey', async () => {
    await withFreshDb(async () => {
      const res = await clientsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Foo' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Foo');
      expect(body).toHaveProperty('apiKey');
      expect(typeof body.id).toBe('string');
      expect(typeof body.apiKey).toBe('string');
    });
  });

  it('POST / with {} returns 400 OpenAI-style error', async () => {
    await withFreshDb(async () => {
      const res = await clientsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('POST / with invalid JSON returns 400', async () => {
    await withFreshDb(async () => {
      const res = await clientsApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('GET / returns array including created clients', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeClient(db, { name: 'Alpha' });
      await makeClient(db, { name: 'Beta' });

      const res = await clientsApp.request('/');
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(2);
      const names = body.map((c: { name: string }) => c.name);
      expect(names).toContain('Alpha');
      expect(names).toContain('Beta');
    });
  });

  it('DELETE /:id returns 204 and soft-deletes the client', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db, { name: 'ToDelete' });

      const delRes = await clientsApp.request(`/${client.id}`, { method: 'DELETE' });
      expect(delRes.status).toBe(204);

      const getRes = await clientsApp.request('/');
      const list = await getRes.json();
      const found = list.find((c: { id: string; deletedAt: string | null }) => c.id === client.id);
      expect(found).toBeDefined();
      expect(found.deletedAt).not.toBeNull();
    });
  });

  it('DELETE /:id for unknown id returns 404 OpenAI-style error', async () => {
    await withFreshDb(async () => {
      const res = await clientsApp.request('/unknown-id', { method: 'DELETE' });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  describe('PATCH /:id', () => {
    it('renames an existing client', async () => {
      await withFreshDb(async (db) => {
        const client = await makeClient(db, { name: 'alpha' });
        const res = await clientsApp.request(`/${client.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'alpha-renamed' }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe(client.id);
        expect(body.name).toBe('alpha-renamed');

        // verify persistence
        const getRes = await clientsApp.request('/');
        const list = await getRes.json();
        const found = list.find((c: any) => c.id === client.id);
        expect(found.name).toBe('alpha-renamed');
      });
    });

    it('returns 404 for unknown id', async () => {
      await withFreshDb(async () => {
        const res = await clientsApp.request('/non-existent-id', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'newname' }),
        });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toHaveProperty('type', 'not_found_error');
      });
    });

    it('returns 409 for duplicate name', async () => {
      await withFreshDb(async (db) => {
        await makeClient(db, { name: 'taken' });
        const client = await makeClient(db, { name: 'free' });

        const res = await clientsApp.request(`/${client.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'taken' }),
        });
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toHaveProperty('type', 'conflict_error');
      });
    });

    it('returns 400 for missing name', async () => {
      await withFreshDb(async (db) => {
        const client = await makeClient(db, { name: 'ok' });
        const res = await clientsApp.request(`/${client.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toHaveProperty('type', 'invalid_request_error');
      });
    });
  });
});
