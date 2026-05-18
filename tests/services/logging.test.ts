import { describe, it, expect, vi } from 'vitest';
import { freshDb, schema } from '../helpers/db.js';
import { buildLogRecord, writeLogRecord } from '../../src/services/logging.js';
import type { RawUpstream } from '../../src/services/upstreams.js';

describe('logging service', () => {
  describe('buildLogRecord', () => {
    it('returns an insert-shaped object with id set and upstream fields snapshotted', () => {
      const upstream: RawUpstream = {
        id: 'upstream-id',
        name: 'ollama',
        baseUrl: 'http://localhost:11434',
        apiKey: 'secret-key',
        headers: { h1: 'v1' },
        createdAt: new Date('2024-01-01'),
      };

      const record = buildLogRecord({
        clientId: 'client-id',
        clientName: 'Test Client',
        modelId: 'openai/gpt-4o',
        upstream,
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        latencyMs: 150,
        timeToFirstTokenMs: 50,
        finishReason: 'stop',
        status: 'success',
        statusCode: 200,
        errorMessage: null,
        startTime: new Date('2024-01-02T12:00:00Z'),
      });

      expect(record.id).toBeDefined();
      expect(record.clientId).toBe('client-id');
      expect(record.clientName).toBe('Test Client');
      expect(record.modelId).toBe('openai/gpt-4o');
      expect(record.upstreamId).toBe('upstream-id');
      expect(record.upstreamName).toBe('ollama');
      expect(record.promptTokens).toBe(10);
      expect(record.completionTokens).toBe(20);
      expect(record.totalTokens).toBe(30);
      expect(record.latencyMs).toBe(150);
      expect(record.timeToFirstTokenMs).toBe(50);
      expect(record.finishReason).toBe('stop');
      expect(record.status).toBe('success');
      expect(record.statusCode).toBe(200);
      expect(record.errorMessage).toBeNull();
      expect(record.createdAt).toEqual(new Date('2024-01-02T12:00:00Z'));
    });

    it('snapshots null upstream fields when upstream is null', () => {
      const record = buildLogRecord({
        clientId: 'client-id',
        clientName: 'Test Client',
        modelId: 'openai/gpt-4o',
        upstream: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        latencyMs: 100,
        timeToFirstTokenMs: null,
        finishReason: null,
        status: 'error',
        statusCode: 500,
        errorMessage: 'boom',
        startTime: new Date('2024-01-01T00:00:00Z'),
      });

      expect(record.upstreamId).toBeNull();
      expect(record.upstreamName).toBeNull();
      expect(record.promptTokens).toBeNull();
      expect(record.completionTokens).toBeNull();
      expect(record.totalTokens).toBeNull();
      expect(record.timeToFirstTokenMs).toBeNull();
      expect(record.finishReason).toBeNull();
    });
  });

  describe('writeLogRecord', () => {
    it('inserts a row visible via raw DB select', () => {
      const dbCtx = freshDb();
      try {
        const record = buildLogRecord({
          clientId: 'client-id',
          clientName: 'Test Client',
          modelId: 'openai/gpt-4o',
          upstream: null,
          promptTokens: 5,
          completionTokens: 10,
          totalTokens: 15,
          latencyMs: 200,
          timeToFirstTokenMs: null,
          finishReason: 'stop',
          status: 'success',
          statusCode: 200,
          errorMessage: null,
          startTime: new Date('2024-06-15T10:30:00Z'),
        });

        writeLogRecord(record);

        const rows = dbCtx.db.select().from(schema.logRecords).all();
        expect(rows.length).toBe(1);
        expect(rows[0].clientId).toBe('client-id');
        expect(rows[0].latencyMs).toBe(200);
      } finally {
        dbCtx.cleanup();
      }
    });

    it('does NOT throw even if insert fails (bad row); logs via console.error', () => {
      const dbCtx = freshDb();
      try {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const badRecord = { id: 'bad' } as any; // missing required fields

        expect(() => writeLogRecord(badRecord)).not.toThrow();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      } finally {
        dbCtx.cleanup();
      }
    });
  });
});
