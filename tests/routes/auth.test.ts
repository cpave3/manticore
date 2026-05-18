import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { withFreshDb } from '../helpers/db.js';
import { makeClient } from '../helpers/factories.js';
import proxyApp from '../../src/routes/proxy.js';
import { getDb } from '../../src/db/client.js';
import { clients } from '../../src/db/schema.js';

describe('auth middleware', () => {
  it('rejects requests without Authorization header with 401 + OpenAI-style error', async () => {
    await withFreshDb(async () => {
      const res = await proxyApp.request('/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'a/b', messages: [] }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('rejects malformed Authorization (no Bearer)', async () => {
    await withFreshDb(async () => {
      const res = await proxyApp.request('/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic abc123',
        },
        body: JSON.stringify({ model: 'a/b', messages: [] }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('rejects a valid-format key that does not match any client', async () => {
    await withFreshDb(async () => {
      const res = await proxyApp.request('/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mc_deadbeefcafebabe0000000000000000',
        },
        body: JSON.stringify({ model: 'a/b', messages: [] }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('rejects a key belonging to a soft-deleted client', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db, { name: 'DeletedClient' });
      // soft-delete
      await db.update(clients).set({ deletedAt: new Date() }).where(eq(clients.id, client.id));

      const res = await proxyApp.request('/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${client.apiKey}`,
        },
        body: JSON.stringify({ model: 'a/b', messages: [] }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('accepts a valid key for an active client (auth passes, next validation fails)', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db, { name: 'ActiveClient' });

      // No model or messages → 400 from proxy logic, but auth must have passed
      const res = await proxyApp.request('/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${client.apiKey}`,
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
      // Not a 401, so auth succeeded
    });
  });
});
