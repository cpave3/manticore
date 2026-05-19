import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { freshDb, schema } from '../helpers/db.js';
import { makeClient } from '../helpers/factories.js';
import {
  createClient,
  listClients,
  deleteClient,
  updateClientName,
  findClientByApiKey,
} from '../../src/services/clients.js';
import { HttpError } from '../../src/lib/errors.js';

let dbCtx: ReturnType<typeof freshDb>;

describe('clients service', () => {
  beforeEach(() => {
    dbCtx = freshDb();
  });

  afterEach(() => {
    dbCtx.cleanup();
  });

  describe('createClient', () => {
    it('inserts a row and returns a response plus the full apiKey', async () => {
      const result = await createClient('Foo');
      expect(result.client.name).toBe('Foo');
      expect(result.apiKey.startsWith('mc_')).toBe(true);
      expect(result.client.apiKeyPrefix).toBe(result.apiKey.slice(0, 7));
      expect(result.client.apiKeyMasked).toBe(maskApiKey(result.apiKey));
    });

    it('produces two unique api keys on two calls with different names', async () => {
      const a = await createClient('Foo');
      const b = await createClient('Bar');
      expect(a.apiKey).not.toBe(b.apiKey);
    });
  });

  describe('listClients', () => {
    it('returns rows ordered by createdAt asc and includes soft-deleted entries', async () => {
      const c1 = await makeClient(dbCtx.db, { name: 'A', createdAt: new Date('2024-01-01') });
      const c2 = await makeClient(dbCtx.db, { name: 'B', createdAt: new Date('2024-01-02') });
      const c3 = await makeClient(dbCtx.db, { name: 'C', createdAt: new Date('2024-01-03'), deletedAt: new Date('2024-01-04') });

      const list = await listClients();
      expect(list.length).toBe(3);
      expect(list[0].id).toBe(c1.id);
      expect(list[1].id).toBe(c2.id);
      expect(list[2].id).toBe(c3.id);
      expect(list[2].deletedAt).not.toBeNull();
    });
  });

  describe('deleteClient', () => {
    it('sets deletedAt rather than removing the row; row still appears in listClients', async () => {
      const { client: created } = await createClient('ToDelete');
      await deleteClient(created.id);

      const list = await listClients();
      const row = list.find((c) => c.id === created.id);
      expect(row).toBeDefined();
      expect(row!.deletedAt).not.toBeNull();

      const raw = await dbCtx.db.select().from(schema.clients).where(eq(schema.clients.id, created.id));
      expect(raw[0].deletedAt).not.toBeNull();
    });

    it('throws HttpError(404) for unknown id', async () => {
      await expect(deleteClient('non-existent-id')).rejects.toThrow(HttpError);
      try {
        await deleteClient('non-existent-id');
      } catch (err) {
        expect((err as HttpError).status).toBe(404);
      }
    });
  });

  describe('updateClientName', () => {
    it('renames a client and returns the response', async () => {
      const { client: created } = await createClient('old-name');
      const resp = await updateClientName(created.id, 'new-name');
      expect(resp.name).toBe('new-name');
      expect(resp.id).toBe(created.id);

      // verify persistence
      const list = await listClients();
      const found = list.find((c) => c.id === created.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('new-name');
    });

    it('throws HttpError(404) for unknown id', async () => {
      await expect(updateClientName('non-existent-id', 'whatever')).rejects.toThrow(HttpError);
      try {
        await updateClientName('non-existent-id', 'whatever');
      } catch (err) {
        expect((err as HttpError).status).toBe(404);
      }
    });

    it('throws HttpError(409) for duplicate name', async () => {
      await createClient('existing');
      const { client: c2 } = await createClient('original');
      await expect(updateClientName(c2.id, 'existing')).rejects.toThrow(HttpError);
      try {
        await updateClientName(c2.id, 'existing');
      } catch (err) {
        expect((err as HttpError).status).toBe(409);
      }
    });
  });

  describe('findClientByApiKey', () => {
    it('returns {id, name} for an active client', async () => {
      const { client: created, apiKey } = await createClient('Active');
      const found = await findClientByApiKey(apiKey);
      expect(found).toEqual({ id: created.id, name: 'Active' });
    });

    it('returns null for non-existent key', async () => {
      const found = await findClientByApiKey('mc_nonexistentkey123456789012345678901234567890');
      expect(found).toBeNull();
    });

    it('returns null for soft-deleted client', async () => {
      const { client: created, apiKey } = await createClient('SoftDelete');
      await deleteClient(created.id);
      const found = await findClientByApiKey(apiKey);
      expect(found).toBeNull();
    });
  });
});

function maskApiKey(key: string): string {
  if (key.length <= 4) return key;
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}
